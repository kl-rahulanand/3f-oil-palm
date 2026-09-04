import { Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AuthUser, Pin, PinSnapshot, ResultTable, Selection } from "@3f/contract";
import { and, eq } from "drizzle-orm";
import { DRIZZLE_DB, loadConfig } from "../config";
import type { AppDb } from "../db/pool";
import { dashboardPins, pinSnapshots } from "../db/schema";
import { RbacService } from "../core/rbac.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";
import { SelectionExecutor } from "../chat/selectionExecutor";

type DashboardPinRow = typeof dashboardPins.$inferSelect;
type PinSnapshotRow = typeof pinSnapshots.$inferSelect;
type SnapshotStatus = PinSnapshot["status"];

@Injectable()
export class PinRefreshService implements OnModuleInit, OnModuleDestroy {
  #running = false;
  private timer?: ReturnType<typeof setInterval>;
  private readonly manualRefreshes = new Map<string, { promise?: Promise<PinSnapshot | undefined>; at: number }>();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly rbac: RbacService,
    private readonly semantic: SemanticLayer,
    private readonly selectionExecutor: SelectionExecutor,
  ) {}

  onModuleInit(): void {
    const interval = loadConfig().pinRefreshIntervalMs;
    if (interval <= 0) return;

    this.timer = setInterval(() => {
      void this.refreshAllDue();
    }, interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  hasTimer(): boolean {
    return this.timer !== undefined;
  }

  async refreshPin(pin: DashboardPinRow): Promise<PinSnapshot | undefined> {
    try {
      const currentUser = await this.rbac.resolveUser(pin.userId);
      if (!currentUser) {
        return this.storeAccessRevoked(pin, "User no longer has access");
      }

      const selection = pin.selection as Selection;
      let domain = this.semantic.domain(selection.domain);
      try {
        validateSelectionForUser(this.semantic, currentUser, selection);
        domain = this.semantic.domain(selection.domain);
        const validatedDomain = domain;
        if (!validatedDomain) throw new Error(`Unknown domain: ${selection.domain}`);
        if (validatedDomain.scopeColumn && !currentUser.scope.some((scope) => scope.attribute === validatedDomain.scopeColumn)) {
          throw new Error(`Missing required scope for domain: ${selection.domain}`);
        }
      } catch (error) {
        return this.storeAccessRevoked(pin, errorMessage(error));
      }
      if (!domain) return this.storeAccessRevoked(pin, `Unknown domain: ${selection.domain}`);

      try {
        const execution = await this.selectionExecutor.run(currentUser, domain, selection);
        const dataAsOf = await this.selectionExecutor.freshness(domain).catch(() => null);
        const row = await this.upsertSnapshot(pin.id, {
          status: "ok",
          resultJson: execution.result,
          chartType: pin.chartType,
          dataAsOf: parseDateOrNull(dataAsOf),
          computedAt: new Date(),
          errorMessage: null,
        });
        await this.db
          .update(dashboardPins)
          .set({ lastRefresh: row.computedAt })
          .where(eq(dashboardPins.id, pin.id));
        return toSnapshot(row);
      } catch (error) {
        return this.storeExecutionError(pin, errorMessage(error));
      }
    } catch (error) {
      return this.storeExecutionError(pin, errorMessage(error));
    }
  }

  async refreshAllDue(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const pins = await this.db.select().from(dashboardPins);
      const groups = new Map<string, DashboardPinRow[]>();
      for (const pin of pins) {
        const key = `${pin.userId}\u0000${normalizedJson(pin.selection)}`;
        groups.set(key, [...(groups.get(key) ?? []), pin]);
      }

      let refreshed = 0;
      for (const group of groups.values()) {
        const [first, ...duplicates] = group;
        const snapshot = await this.refreshPin(first);
        refreshed += 1;
        if (!snapshot) continue;
        for (const duplicate of duplicates) {
          await this.copySnapshot(duplicate, snapshot);
        }
      }
      console.log(`PIN REFRESH: refreshed=${refreshed} pins=${pins.length} groups=${groups.size}`);
    } catch (error) {
      console.warn(`PIN REFRESH FAILED: ${errorMessage(error)}`);
    } finally {
      this.#running = false;
    }
  }

  async refreshOne(user: AuthUser, pinId: string): Promise<PinSnapshot | undefined> {
    const rows = await this.db
      .select()
      .from(dashboardPins)
      .where(and(eq(dashboardPins.id, pinId), eq(dashboardPins.userId, user.id)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException("Pin not found");

    const current = this.manualRefreshes.get(pinId);
    if (current?.promise) return current.promise;

    const minInterval = loadConfig().pinRefreshMinIntervalMs;
    const now = Date.now();
    if (current && now - current.at < minInterval) {
      const existing = await this.currentSnapshot(pinId);
      if (existing) return existing;
    }

    const promise = this.refreshPin(rows[0]);
    this.manualRefreshes.set(pinId, { promise, at: now });
    try {
      return await promise;
    } finally {
      this.manualRefreshes.set(pinId, { at: Date.now() });
    }
  }

  async refreshAllForUser(user: AuthUser): Promise<Array<PinSnapshot | undefined>> {
    const rows = await this.db
      .select({ id: dashboardPins.id })
      .from(dashboardPins)
      .where(eq(dashboardPins.userId, user.id));
    const snapshots: Array<PinSnapshot | undefined> = [];
    for (const row of rows) {
      snapshots.push(await this.refreshOne(user, row.id));
    }
    return snapshots;
  }

  private async storeAccessRevoked(pin: DashboardPinRow, message: string): Promise<PinSnapshot> {
    const row = await this.upsertSnapshot(pin.id, {
      status: "access_revoked",
      resultJson: null,
      chartType: pin.chartType,
      dataAsOf: null,
      computedAt: new Date(),
      errorMessage: message,
    });
    await this.db.update(dashboardPins).set({ lastRefresh: row.computedAt }).where(eq(dashboardPins.id, pin.id));
    return toSnapshot(row);
  }

  private async storeExecutionError(pin: DashboardPinRow, message: string): Promise<PinSnapshot | undefined> {
    const existing = await this.snapshotRow(pin.id);
    const computedAt = new Date();
    if (existing) {
      const updated = await this.db
        .update(pinSnapshots)
        .set({ status: "error", errorMessage: message, computedAt })
        .where(eq(pinSnapshots.pinId, pin.id))
        .returning();
      return toSnapshot(updated[0]);
    }

    const row = await this.upsertSnapshot(pin.id, {
      status: "error",
      resultJson: null,
      chartType: pin.chartType,
      dataAsOf: null,
      computedAt,
      errorMessage: message,
    });
    return toSnapshot(row);
  }

  private async copySnapshot(pin: DashboardPinRow, source: PinSnapshot): Promise<void> {
    await this.upsertSnapshot(pin.id, {
      status: source.status,
      resultJson: source.result ?? null,
      chartType: pin.chartType,
      dataAsOf: parseDateOrNull(source.dataAsOf ?? null),
      computedAt: new Date(source.computedAt),
      errorMessage: source.errorMessage ?? null,
    });
  }

  private async upsertSnapshot(
    pinId: string,
    values: {
      status: SnapshotStatus;
      resultJson: ResultTable | null;
      chartType: string | null;
      dataAsOf: Date | null;
      computedAt: Date;
      errorMessage: string | null;
    },
  ): Promise<PinSnapshotRow> {
    const rows = await this.db
      .insert(pinSnapshots)
      .values({ pinId, ...values })
      .onConflictDoUpdate({
        target: pinSnapshots.pinId,
        set: values,
      })
      .returning();
    return rows[0];
  }

  private async currentSnapshot(pinId: string): Promise<PinSnapshot | undefined> {
    const row = await this.snapshotRow(pinId);
    return row ? toSnapshot(row) : undefined;
  }

  private async snapshotRow(pinId: string): Promise<PinSnapshotRow | undefined> {
    const rows = await this.db
      .select()
      .from(pinSnapshots)
      .where(eq(pinSnapshots.pinId, pinId))
      .limit(1);
    return rows[0];
  }
}

export function toSnapshot(row: PinSnapshotRow): PinSnapshot {
  return {
    status: row.status as PinSnapshot["status"],
    ...(row.resultJson ? { result: row.resultJson as ResultTable } : {}),
    ...(row.chartType ? { chartType: row.chartType as Pin["chartType"] } : {}),
    dataAsOf: row.dataAsOf ? row.dataAsOf.toISOString() : null,
    computedAt: row.computedAt.toISOString(),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
  };
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}
