import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { DomainSpec, MeasureSpec } from "@3f/contract";
import { ALARM_SINK, RECON_STORE, WAREHOUSE, loadConfig } from "../config";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { Warehouse } from "../warehouse/warehouse.interface";
import type { AlarmSink } from "./recon.alarm";
import type { ReconStatus, ReconStore } from "./recon.store";

export interface CriticalMeasure {
  domain: DomainSpec;
  measure: MeasureSpec & { reconciliation: { altExpr: string; tolerance: number } };
}

export interface ReconciliationResult {
  measureId: string;
  primary: number | null;
  alt: number | null;
  diff: number | null;
  withinTolerance: boolean;
  status: ReconStatus;
}

@Injectable()
export class ReconciliationService implements OnModuleInit, OnModuleDestroy {
  #running = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    private readonly semantic: SemanticLayer,
    @Inject(RECON_STORE) private readonly store: ReconStore,
    @Inject(ALARM_SINK) private readonly alarm: AlarmSink,
  ) {}

  onModuleInit(): void {
    const interval = loadConfig().reconIntervalMs;
    if (interval <= 0) return;

    this.timer = setInterval(() => {
      void this.runOnce();
    }, interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  hasTimer(): boolean {
    return this.timer !== undefined;
  }

  criticalMeasures(): CriticalMeasure[] {
    const critical: CriticalMeasure[] = [];
    for (const domain of this.semantic.all()) {
      for (const measure of domain.measures) {
        if (measure.critical && measure.reconciliation) {
          critical.push({
            domain,
            measure: measure as CriticalMeasure["measure"],
          });
        }
      }
    }
    return critical;
  }

  async reconcileMeasure(domain: DomainSpec, measure: MeasureSpec): Promise<ReconciliationResult> {
    if (!measure.reconciliation) {
      return {
        measureId: measure.id,
        primary: null,
        alt: null,
        diff: null,
        withinTolerance: false,
        status: "unavailable",
      };
    }

    try {
      const result = await this.warehouse.execute(this.buildSql(domain, measure));
      const row = result.rows[0];
      const primary = toFiniteNumber(row?.primary_value);
      const alt = toFiniteNumber(row?.alt_value);
      if (primary === null || alt === null) {
        return await this.recordUnavailable(measure.id, primary, alt);
      }

      const diff = Math.abs(primary - alt);
      const withinTolerance = diff <= measure.reconciliation.tolerance;
      const status: ReconStatus = withinTolerance ? "match" : "divergence";
      const run = { measureId: measure.id, primaryValue: primary, altValue: alt, diff, withinTolerance, status };
      await this.store.record(run);

      if (!withinTolerance) {
        this.alarm.raise({
          measureId: measure.id,
          primaryValue: primary,
          altValue: alt,
          diff,
          message: `RECON DIVERGENCE ${measure.id}: primary=${primary} alt=${alt} diff=${diff} - INVESTIGATE (neither path is canonical)`,
        });
      }

      return { measureId: measure.id, primary, alt, diff, withinTolerance, status };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return await this.recordUnavailable(measure.id, null, null, detail);
    }
  }

  async reconcileAll(): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];
    for (const { domain, measure } of this.criticalMeasures()) {
      results.push(await this.reconcileMeasure(domain, measure));
    }
    return results;
  }

  async runOnce(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      await this.reconcileAll();
    } catch (error) {
      console.warn(
        `RECON RUN FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.#running = false;
    }
  }

  divergenceCount(sinceIso?: string): Promise<number> {
    return this.store.divergenceCount(sinceIso);
  }

  /**
   * Compose the reconciliation query from the trusted semantic layer only — both the primary
   * expr and the alt expr are code/spec-owned, never user input (same trust rule as the
   * SQL builder / freshness / distinctValues).
   */
  private buildSql(domain: DomainSpec, measure: MeasureSpec): string {
    const predicate =
      measure.impliedFilters.length > 0 ? `\nWHERE ${measure.impliedFilters.join(" AND ")}` : "";
    return [
      "SELECT",
      `  (${measure.expr}) AS primary_value,`,
      `  (${measure.reconciliation?.altExpr}) AS alt_value`,
      `FROM ${domain.goldObject}${predicate}`,
    ].join("\n");
  }

  private async recordUnavailable(
    measureId: string,
    primary: number | null,
    alt: number | null,
    detail?: string,
  ): Promise<ReconciliationResult> {
    await this.store.record({
      measureId,
      primaryValue: primary,
      altValue: alt,
      diff: null,
      withinTolerance: false,
      status: "unavailable",
    });
    console.warn(`RECON UNAVAILABLE ${measureId}: could not reconcile${detail ? ` - ${detail}` : ""}`);
    return {
      measureId,
      primary,
      alt,
      diff: null,
      withinTolerance: false,
      status: "unavailable",
    };
  }
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
