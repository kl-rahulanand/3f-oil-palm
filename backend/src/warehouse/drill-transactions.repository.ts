import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { FixedScaleMoney, MisDrillLine, ProvenanceBatch } from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import { SqlValidator } from "../sql/sqlValidator";
import type {
  DrillBatch,
  DrillPredicate,
  DrillQueries,
  DrillReadResult,
  DrillSummary,
  IDrillTransactionsRepository,
} from "./drill-transactions.interface";
import type { QueryResult, Warehouse } from "./warehouse.interface";

export const DRILL_PAGE_SIZE = 100;
const OBJECTS_TOUCHED = ["sap_transaction", "ingest_batch"];

@Injectable()
export class DrillTransactionsRepository implements IDrillTransactionsRepository {
  constructor(
    private readonly validator: SqlValidator,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
  ) {}

  async findBatchStates(pins: ProvenanceBatch[]): Promise<DrillBatch[]> {
    if (pins.length === 0) return [];
    const ids = pins.map(({ batchId }) => batchId);
    const activePredicates = uniquePins(pins).map(
      ({ source, period }) => `(source_kind = ${quote(source)} AND period = ${quote(period)})`,
    );
    const result = await this.warehouse.execute(`SELECT id, source_kind, period, is_active
FROM ingest_batch
WHERE id IN (${ids.map(quote).join(", ")})
   OR (is_active AND (${activePredicates.join(" OR ")}))
LIMIT 25000`);
    return batches(result);
  }

  async findActualPeriods(from: string, to: string): Promise<string[]> {
    const result = await this.warehouse.execute(`SELECT DISTINCT period
FROM ingest_batch
WHERE source_kind = 'actuals' AND period >= ${quote(from)} AND period <= ${quote(to)}
ORDER BY period
LIMIT 25000`);
    return result.rows
      .map(({ period }) => normalizeDateOnly(period))
      .filter((period): period is string => Boolean(period));
  }

  buildQueries(predicate: DrillPredicate, page: number, rowLimit: number): DrillQueries {
    const where = buildDrillPredicate(predicate);
    return {
      pageSql: `SELECT txn.month, txn.posting_date, txn.txn_no, txn.cost_center, txn.acct_name,
  txn.debit::text AS debit, txn.credit::text AS credit,
  (txn.debit - txn.credit)::numeric(18,2)::text AS value, txn.reference, txn.memo
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE ${where}
ORDER BY (txn.debit - txn.credit) DESC, txn.month DESC, txn.posting_date DESC, txn.txn_no, txn.line_id
LIMIT ${rowLimit} OFFSET ${(page - 1) * rowLimit}`,
      footerSql: `SELECT COUNT(*) AS total_count,
  COALESCE(SUM(txn.debit), 0)::numeric(18,2)::text AS debit,
  COALESCE(SUM(txn.credit), 0)::numeric(18,2)::text AS credit,
  COALESCE(SUM(txn.debit - txn.credit), 0)::numeric(18,2)::text AS value
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE ${where}
LIMIT 1`,
      objectsTouched: [...OBJECTS_TOUCHED],
    };
  }

  async execute(queries: DrillQueries): Promise<DrillReadResult> {
    const config = loadConfig();
    for (const sql of [queries.pageSql, queries.footerSql]) {
      const validation = this.validator.validate(sql, queries.objectsTouched, config.maxRows);
      if (!validation.ok) throw new ForbiddenException(validation.reason ?? "Drill query blocked");
    }
    await Promise.all([this.warehouse.explain(queries.pageSql), this.warehouse.explain(queries.footerSql)]);
    const [page, footer] = await Promise.all([
      withTimeout(this.warehouse.execute(queries.pageSql), config.queryTimeoutMs),
      withTimeout(this.warehouse.execute(queries.footerSql), config.queryTimeoutMs),
    ]);
    const totals = footer.rows[0] ?? {};
    return {
      lines: page.rows.map(toLine),
      totalCount: integer(totals.total_count),
      footer: {
        debit: money(totals.debit),
        credit: money(totals.credit),
        value: money(totals.value),
      },
    };
  }

  async summarize(rows: Array<{ rowKey: string; predicate: DrillPredicate }>): Promise<DrillSummary[]> {
    if (rows.length === 0) return [];
    const config = loadConfig();
    const summaries: DrillSummary[] = [];
    for (let offset = 0; offset < rows.length; offset += config.maxRows) {
      const batch = rows.slice(offset, offset + config.maxRows);
      const sql = `${batch
        .map(
          ({ rowKey, predicate }) => `(SELECT ${quote(rowKey)} AS row_key, COUNT(*) AS feeding_line_count,
  SUM(txn.debit - txn.credit)::text AS value
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE ${buildDrillPredicate(predicate)}
LIMIT 1)`,
        )
        .join("\nUNION ALL\n")}
LIMIT ${batch.length}`;
      const validation = this.validator.validate(sql, OBJECTS_TOUCHED, config.maxRows);
      if (!validation.ok) throw new ForbiddenException(validation.reason ?? "Drill summary query blocked");
      await this.warehouse.explain(sql);
      const result = await withTimeout(this.warehouse.execute(sql), config.queryTimeoutMs);
      summaries.push(
        ...result.rows.map((row) => ({
          rowKey: requiredText(row.row_key),
          feedingLineCount: integer(row.feeding_line_count),
          value: money(row.value),
        })),
      );
    }
    return summaries;
  }
}

export function buildDrillPredicate(predicate: DrillPredicate): string {
  const batches = predicate.actualBatchIds.length
    ? `txn.batch_id IN (${predicate.actualBatchIds.map(quote).join(", ")})`
    : "FALSE";
  const rowPredicate =
    predicate.mode === "gl-and-plants"
      ? [
          `txn.gl_code = ${quote(predicate.glCode)}`,
          ...predicate.filters.flatMap((filter) => {
            const sql = filterPredicate(filter);
            return sql ? [sql] : [];
          }),
        ].join(" AND ")
      : predicate.triples.length
        ? `(${predicate.triples
            .map(
              ({ plant, costCenter, glCode }) =>
                `(txn.plant = ${quote(plant)} AND txn.cost_center = ${quote(costCenter)} AND txn.gl_code = ${quote(glCode)})`,
            )
            .join(" OR ")})`
        : "FALSE";
  const plants = predicate.plants.length ? `txn.plant IN (${predicate.plants.map(quote).join(", ")})` : "FALSE";
  return `${batches} AND ${rowPredicate} AND ${plants} AND txn.month >= ${quote(predicate.from)} AND txn.month <= ${quote(predicate.to)} AND batch.source_kind = 'actuals'`;
}

function filterPredicate(filter: {
  dimensionId: string;
  op: "eq" | "in" | "neq";
  value: string | string[];
}): string | null {
  const column = filter.dimensionId === "gl_code" ? "txn.gl_code" : filter.dimensionId === "month" ? "txn.month" : null;
  if (!column) return null;
  if (filter.op === "in" && Array.isArray(filter.value)) {
    return `${column} IN (${filter.value.map(quote).join(", ")})`;
  }
  if (typeof filter.value === "string") {
    return `${column} ${filter.op === "neq" ? "<>" : "="} ${quote(filter.value)}`;
  }
  return null;
}

function batches(result: QueryResult): DrillBatch[] {
  return result.rows.map((row) => ({
    source: String(row.source_kind) as DrillBatch["source"],
    period: normalizeDateOnly(row.period) ?? "",
    batchId: String(row.id),
    isActive: String(row.is_active) === "true" || row.is_active === 1,
  }));
}

function toLine(row: Record<string, string | number | null>): MisDrillLine {
  const month = normalizeDateOnly(row.month);
  const postingDate = normalizeDateOnly(row.posting_date);
  if (!month || !postingDate) throw new Error("Drill query returned an invalid date");
  return {
    month,
    postingDate,
    txnNo: requiredText(row.txn_no),
    costCenter: requiredText(row.cost_center),
    accountName: requiredText(row.acct_name),
    debit: money(row.debit),
    credit: money(row.credit),
    value: money(row.value),
    reference: row.reference === null ? null : String(row.reference),
    memo: row.memo === null ? null : String(row.memo),
  };
}

function requiredText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) throw new Error("Drill query returned a missing text value");
  return String(value);
}

export function normalizeDateOnly(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value: string | number | null | undefined): FixedScaleMoney {
  const match = String(value ?? 0).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("Drill query returned an invalid money value");
  const fraction = match[3] ?? "";
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) throw new Error("Drill query returned money below paise");
  return `${match[1]}${match[2]}.${fraction.slice(0, 2).padEnd(2, "0")}` as FixedScaleMoney;
}

function integer(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Drill query returned an invalid count");
  return parsed;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function uniquePins(pins: ProvenanceBatch[]): ProvenanceBatch[] {
  return [...new Map(pins.map((pin) => [`${pin.source}\0${pin.period}`, pin])).values()];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Drill query timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
