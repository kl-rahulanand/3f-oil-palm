import type { ActualTransactionPage, Money } from "@3f/contract";
import { Pool, type PoolClient, type QueryConfig } from "pg";
import { loadConfig } from "../config";
import { buildFinancialActualQuery, type ResolvedFinancialScope } from "./financial-predicate";

type QueryHost = Pick<Pool | PoolClient, "query">;
type Transaction = ActualTransactionPage["transactions"][number];

interface SummaryRow {
  row_count: string;
  actual_total: string;
}

interface TransactionRow {
  id: string;
  transaction_number: string;
  line_id: string;
  posting_date: string | Date;
  reporting_month: string | Date;
  plant_code: string;
  plant_name: string;
  cost_center_code: string | null;
  cost_center_name: string | null;
  gl_account_id: string | null;
  gl_code: string | null;
  gl_name: string | null;
  debit: string;
  credit: string;
  actual_amount: string;
  line_memo: string | null;
  reference_1: string | null;
}

export interface ActualTransactionSummary {
  readonly totalItems: number;
  readonly matchingActualTotal: Money;
}

export class ActualTransactionsRepository {
  private pool?: Pool;

  constructor(private readonly database?: QueryHost) {}

  async summarize(scope: ResolvedFinancialScope): Promise<ActualTransactionSummary | null> {
    const database = this.database ?? this.getPool();
    const source = await database.query<{ source_count: string }>(
      `SELECT count(*)::text AS source_count
         FROM agent_financial.ingestion_batch
        WHERE id = ANY($1::uuid[])`,
      [[...scope.sourceBatchIds]],
    );
    if (Number(source.rows[0]?.source_count ?? 0) !== new Set(scope.sourceBatchIds).size) return null;

    const result = await database.query<SummaryRow>(buildFinancialActualQuery(scope, "summary"));
    const row = result.rows[0];
    if (!row) throw new Error("Actual transaction summary returned no row");
    const totalItems = Number(row.row_count);
    if (!Number.isSafeInteger(totalItems) || totalItems < 0) throw new Error("Actual transaction count is invalid");
    return { totalItems, matchingActualTotal: exactMoney(row.actual_total) };
  }

  async page(scope: ResolvedFinancialScope, offset: number, limit: number): Promise<Transaction[]> {
    const database = this.database ?? this.getPool();
    const detail = buildFinancialActualQuery(scope, "detail");
    const values = [...(detail.values ?? []), limit, offset];
    const pageQuery: QueryConfig = {
      text: `${detail.text}\nLIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    };
    const result = await database.query<TransactionRow>(pageQuery);
    return result.rows.map((row) => ({
      id: row.id,
      transactionNumber: row.transaction_number,
      lineId: row.line_id,
      postingDate: dateOnly(row.posting_date),
      reportingMonth: dateOnly(row.reporting_month),
      plantId: row.plant_code,
      plantLabel: row.plant_name,
      costCenterId: row.cost_center_code,
      costCenterLabel: row.cost_center_name ?? "Cost Center not assigned",
      glAccountId: row.gl_account_id,
      glCode: row.gl_code,
      glName: row.gl_name,
      debit: exactMoney(row.debit),
      credit: exactMoney(row.credit),
      actual: exactMoney(row.actual_amount),
      memo: row.line_memo,
      reference: row.reference_1,
    }));
  }

  private getPool(): Pool {
    if (this.pool) return this.pool;
    const config = loadConfig();
    const postgres = config.warehouse.postgres;
    if (!postgres.host || !postgres.database) throw new Error("Warehouse Postgres is not configured");
    this.pool = new Pool({
      ...postgres,
      max: 5,
      connectionTimeoutMillis: config.queryTimeoutMs,
      statement_timeout: config.queryTimeoutMs,
      query_timeout: config.queryTimeoutMs,
      allowExitOnIdle: true,
    });
    return this.pool;
  }
}

function exactMoney(value: string): Money {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("Warehouse returned invalid money");
  const [, sign, whole, rawFraction = ""] = match;
  if (rawFraction.slice(2).replaceAll("0", "")) throw new Error("Warehouse returned money below paise precision");
  return `${sign}${whole}.${rawFraction.padEnd(2, "0").slice(0, 2)}`;
}

function dateOnly(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
