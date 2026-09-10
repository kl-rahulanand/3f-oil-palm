import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser, DomainSpec, MeasureSpec, ResultTable, Selection } from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { applyKSuppression } from "./suppression";

export interface AppliedTimeWindow {
  from: string;
  to: string;
  column: string;
}

export interface SelectionExecutionResult {
  result: ResultTable;
  totals?: Record<string, number>;
  appliedTimeWindow?: AppliedTimeWindow;
  sql: string;
  objectsTouched: string[];
}

export class SelectionExecutionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionExecutionBlockedError";
  }
}

@Injectable()
export class SelectionExecutor {
  constructor(
    private readonly builder: SqlBuilder,
    private readonly validator: SqlValidator,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
  ) {}

  async run(
    user: AuthUser,
    domain: DomainSpec,
    selection: Selection,
    opts: {
      beforeExecute?: (built: { sql: string; objectsTouched: string[]; selection: Selection }) => Promise<void>;
    } = {},
  ): Promise<SelectionExecutionResult> {
    const appliedTimeWindow = resolveTimeWindow(
      selection.timeWindow,
      defaultTimeColumn(domain, selection),
      new Date(),
      validDateColumns(domain),
    );
    const resolvedSelection = appliedTimeWindow
      ? {
          ...selection,
          timeWindow: {
            ...(selection.timeWindow ?? { grain: "day" as const }),
            from: appliedTimeWindow.from,
            to: appliedTimeWindow.to,
            column: appliedTimeWindow.column,
          },
        }
      : selection;

    const primary = await this.executeResolved(user, domain, resolvedSelection, opts.beforeExecute);
    const totals =
      resolvedSelection.dimensionIds.length > 0 ? await this.totalsFor(user, domain, resolvedSelection) : undefined;

    return {
      result: primary.result,
      ...(totals ? { totals } : {}),
      appliedTimeWindow,
      sql: primary.sql,
      objectsTouched: primary.objectsTouched,
    };
  }

  freshness(domain: DomainSpec): Promise<string | null> {
    return this.warehouse.freshness(domain.goldObject, domain.freshnessColumn);
  }

  private async executeResolved(
    user: AuthUser,
    domain: DomainSpec,
    resolvedSelection: Selection,
    beforeExecute?: (built: { sql: string; objectsTouched: string[]; selection: Selection }) => Promise<void>,
  ): Promise<{ result: ResultTable; sql: string; objectsTouched: string[] }> {
    if (
      domain.composed &&
      (!user.permissions.actions.includes("report") ||
        !user.permissions.domains.includes(domain.name) ||
        !resolvedSelection.measureIds.every((id) => user.permissions.measureIds.includes(id)) ||
        !resolvedSelection.dimensionIds.every((id) => user.permissions.dimensionIds.includes(id)))
    ) {
      throw new SelectionExecutionBlockedError("governed financial selection is not authorized");
    }
    const cfg = loadConfig();
    const built = this.builder.build(domain, resolvedSelection, user);
    await beforeExecute?.({
      sql: built.sql,
      objectsTouched: built.objectsTouched,
      selection: resolvedSelection,
    });

    const validation = this.validator.validate(
      built.sql,
      built.objectsTouched,
      cfg.maxRows,
      domain.blockedColumns ?? [],
    );
    if (!validation.ok) {
      throw new SelectionExecutionBlockedError(validation.reason ?? "query blocked");
    }

    await this.warehouse.explain(built.sql);
    const raw = await withTimeout(this.warehouse.execute(built.sql), cfg.queryTimeoutMs);

    // `numeric` means "measure output" for rendering, not raw warehouse type.
    const measureOutputKeys = new Set(resolvedSelection.measureIds.map((id) => id.split(".").pop()!));
    const labelByKey = new Map<string, string>();
    const formatByKey = new Map<string, "percent">();
    for (const measureId of resolvedSelection.measureIds) {
      const measure = domain.measures.find((candidate) => candidate.id === measureId);
      const key = measureId.split(".").pop();
      if (!measure || !key) continue;
      labelByKey.set(key, measure.label);
      if (measure.format === "percent") formatByKey.set(key, measure.format);
    }
    for (const dimensionId of resolvedSelection.dimensionIds) {
      const dimension = domain.dimensions.find((candidate) => candidate.id === dimensionId);
      if (dimension) labelByKey.set(dimension.id, dimension.label);
    }
    let result: ResultTable = {
      columns: raw.columns.map((column) => {
        const format = formatByKey.get(column.name);
        return {
          key: column.name,
          label: labelByKey.get(column.name) ?? column.name,
          numeric: measureOutputKeys.has(column.name),
          ...(format ? { format } : {}),
        };
      }),
      rows: raw.rows,
    };

    const piiMeasureKeys = resolvedSelection.measureIds
      .map((id) => domain.measures.find((measure) => measure.id === id))
      .filter((measure): measure is MeasureSpec => measure?.piiSensitive === true)
      .map((measure) => measure.id.split(".").pop()!);
    if (piiMeasureKeys.length > 0) {
      result = applyKSuppression(result, {
        countKey: "__group_count",
        measureKeys: piiMeasureKeys,
        k: cfg.suppressionK,
      });
    }

    return { result, sql: built.sql, objectsTouched: built.objectsTouched };
  }

  private async totalsFor(
    user: AuthUser,
    domain: DomainSpec,
    resolvedSelection: Selection,
  ): Promise<Record<string, number> | undefined> {
    const ungrouped = await this.executeResolved(user, domain, {
      ...resolvedSelection,
      dimensionIds: [],
    });
    const row = ungrouped.result.rows[0];
    if (!row) return undefined;

    const totals: Record<string, number> = {};
    for (const measureId of resolvedSelection.measureIds) {
      const key = measureId.split(".").pop();
      if (!key) continue;
      const rawValue = row[key];
      const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (Number.isFinite(numericValue)) totals[key] = numericValue;
    }

    return Object.keys(totals).length > 0 ? totals : undefined;
  }
}

export function resolveSelectionTimeWindow(
  domain: DomainSpec,
  selection: Selection,
  now = new Date(),
): { selection: Selection; appliedTimeWindow?: AppliedTimeWindow } {
  const appliedTimeWindow = resolveTimeWindow(
    selection.timeWindow,
    defaultTimeColumn(domain, selection),
    now,
    validDateColumns(domain),
  );
  if (!appliedTimeWindow) return { selection };
  return {
    selection: {
      ...selection,
      timeWindow: {
        ...(selection.timeWindow ?? { grain: "day" as const }),
        from: appliedTimeWindow.from,
        to: appliedTimeWindow.to,
        column: appliedTimeWindow.column,
      },
    },
    appliedTimeWindow,
  };
}

export function resolveTimeWindow(
  timeWindow: Selection["timeWindow"] | undefined,
  defaultColumn: string | undefined,
  now: Date,
  validColumns?: ReadonlySet<string>,
): AppliedTimeWindow | undefined {
  if (!timeWindow || !defaultColumn) return undefined;

  const requestedColumn = timeWindow.column;
  const column =
    requestedColumn && (!validColumns || validColumns.has(requestedColumn)) ? requestedColumn : defaultColumn;

  if (timeWindow.from && timeWindow.to) {
    return { from: timeWindow.from, to: timeWindow.to, column };
  }

  if (typeof timeWindow.last === "number" && timeWindow.last > 0) {
    const toDate = dateOnlyUtc(now);
    const fromDate = dateOnlyUtc(now);
    if (timeWindow.grain === "day") fromDate.setUTCDate(fromDate.getUTCDate() - timeWindow.last);
    if (timeWindow.grain === "week") fromDate.setUTCDate(fromDate.getUTCDate() - timeWindow.last * 7);
    if (timeWindow.grain === "month") fromDate.setUTCMonth(fromDate.getUTCMonth() - timeWindow.last);
    return { from: isoDate(fromDate), to: isoDate(toDate), column };
  }

  return undefined;
}

export function defaultTimeColumn(domain: DomainSpec, selection: Selection): string | undefined {
  const selected = new Set(selection.measureIds);
  return (
    domain.measures.find((measure) => selected.has(measure.id) && measure.timeColumn)?.timeColumn ??
    domain.dimensions.find((dimension) => dimension.id === "date")?.column ??
    Array.from(validDateColumns(domain))[0]
  );
}

export function validDateColumns(domain: DomainSpec): ReadonlySet<string> {
  const measureTimeColumns = new Set(
    domain.measures.map((measure) => measure.timeColumn).filter((column): column is string => Boolean(column)),
  );
  return new Set(
    domain.dimensions
      .filter((dimension) => {
        const id = dimension.id.toLocaleLowerCase();
        const label = dimension.label.toLocaleLowerCase();
        const column = dimension.column.toLocaleLowerCase();
        return (
          measureTimeColumns.has(dimension.column) ||
          id.includes("date") ||
          label.includes("date") ||
          column.includes("date") ||
          column.endsWith("_day") ||
          column === "log_day"
        );
      })
      .map((dimension) => dimension.column),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("query timed out")), ms)),
  ]);
}

function dateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
