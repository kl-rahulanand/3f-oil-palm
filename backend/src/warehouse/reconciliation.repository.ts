import { readFileSync } from "node:fs";
import type { Pool } from "pg";

export interface ReconciliationExpectation {
  plant: string;
  period: string;
  source: string;
  lineCount: number;
  expectedNetPaise: string;
}

export interface ActualsReconciliation {
  plant: string;
  period: string;
  rawNet: string;
  goldNet: string;
  lineCount: number;
}

type QueryHost = Pick<Pool, "query">;

export async function reconcileActualsByKeyMonth(
  db: QueryHost,
  key: Pick<ReconciliationExpectation, "plant" | "period">,
): Promise<ActualsReconciliation> {
  const result = await db.query<{
    plant: string;
    period: string;
    raw_net: string;
    gold_net: string;
    line_count: number;
  }>(
    `WITH raw AS (
       SELECT
         COALESCE(SUM(txn.debit - txn.credit), 0)::numeric(18, 2)::text AS raw_net,
         COUNT(*)::integer AS line_count
       FROM sap_transaction AS txn
       INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
       WHERE batch.source_kind = 'actuals'
         AND batch.is_active
         AND txn.plant = $1
         AND txn.month = $2::date
     ), gold AS (
       SELECT COALESCE(SUM(actual_net), 0)::numeric(18, 2)::text AS gold_net
       FROM actual_by_key_month
       WHERE plant = $1 AND month = $2::date
     )
     SELECT $1::text AS plant, $2::date::text AS period, raw.raw_net, gold.gold_net, raw.line_count
     FROM raw CROSS JOIN gold`,
    [key.plant, key.period],
  );
  const row = result.rows[0];
  return {
    plant: row.plant,
    period: row.period,
    rawNet: row.raw_net,
    goldNet: row.gold_net,
    lineCount: row.line_count,
  };
}

export function loadReconciliationExpectation(path: string): ReconciliationExpectation {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as ReconciliationExpectation).plant !== "string" ||
    !/^\d{4}-\d{2}-01$/.test((value as ReconciliationExpectation).period) ||
    typeof (value as ReconciliationExpectation).source !== "string" ||
    !Number.isInteger((value as ReconciliationExpectation).lineCount) ||
    typeof (value as ReconciliationExpectation).expectedNetPaise !== "string" ||
    !/^-?\d+\.\d{2}$/.test((value as ReconciliationExpectation).expectedNetPaise)
  ) {
    throw new Error("Invalid reconciliation expectation fixture");
  }
  return value as ReconciliationExpectation;
}
