import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

type BatchResult = Record<string, unknown>;

// Context is King: warehouse rows inherit the app-user audit identity through
// ingest_batch.uploaded_by; cross-database Account foreign keys are intentionally impossible.
export const ingestBatch = pgTable(
  "ingest_batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKind: text("source_kind").notNull(),
    period: date("period").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAtUtc: timestamp("uploaded_at_utc", { withTimezone: true }).notNull().defaultNow(),
    rowCount: integer("row_count").notNull(),
    validationResult: jsonb("validation_result").$type<BatchResult>().notNull(),
    reconciliationResult: jsonb("reconciliation_result").$type<BatchResult>().notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    updatedAtUtc: timestamp("updated_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("ingest_batch_source_kind_check", sql`${table.sourceKind} IN ('actuals', 'budget')`),
    check("ingest_batch_period_month_check", sql`${table.period} = date_trunc('month', ${table.period})::date`),
    check("ingest_batch_row_count_check", sql`${table.rowCount} >= 0`),
    uniqueIndex("ingest_batch_active_source_period_unique")
      .on(table.sourceKind, table.period)
      .where(sql`${table.isActive}`),
  ],
);

export const sapTransaction = pgTable(
  "sap_transaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => ingestBatch.id),
    txnNo: text("txn_no").notNull(),
    lineId: text("line_id").notNull(),
    postingDate: date("posting_date").notNull(),
    month: date("month").notNull(),
    plant: text("plant").notNull(),
    plantSrc: text("plant_src").notNull(),
    costCenter: text("cost_center").notNull(),
    glCode: text("gl_code").notNull(),
    acctName: text("acct_name").notNull(),
    contraAccount: text("contra_account"),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull(),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull(),
    memo: text("memo"),
    reference: text("reference"),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    updatedAtUtc: timestamp("updated_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("sap_transaction_month_check", sql`${table.month} = date_trunc('month', ${table.month})::date`),
    unique("sap_transaction_batch_source_line_unique").on(table.batchId, table.txnNo, table.lineId),
    index("idx_sap_transaction_batch_id").on(table.batchId),
    index("idx_sap_transaction_month_plant_cost_center_gl_code").on(
      table.month,
      table.plant,
      table.costCenter,
      table.glCode,
    ),
  ],
);

export const misBudget = pgTable(
  "mis_budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => ingestBatch.id),
    formatId: text("format_id").notNull(),
    period: date("period").notNull(),
    lineId: text("line_id").notNull(),
    glCode: text("gl_code").notNull(),
    costCenter: text("cost_center").notNull(),
    budgetAmount: numeric("budget_amount", { precision: 18, scale: 2 }).notNull(),
    rolloverAmount: numeric("rollover_amount", { precision: 18, scale: 2 }).notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    updatedAtUtc: timestamp("updated_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mis_budget_period_month_check", sql`${table.period} = date_trunc('month', ${table.period})::date`),
    unique("mis_budget_batch_grain_unique").on(
      table.batchId,
      table.formatId,
      table.period,
      table.lineId,
      table.glCode,
      table.costCenter,
    ),
    index("idx_mis_budget_batch_id").on(table.batchId),
  ],
);

export const actualByKeyMonth = pgView("actual_by_key_month", {
  plant: text("plant").notNull(),
  costCenter: text("cost_center").notNull(),
  glCode: text("gl_code").notNull(),
  month: date("month").notNull(),
  actualNet: numeric("actual_net", { precision: 18, scale: 2 }).notNull(),
}).as(sql`
  SELECT
    txn.plant,
    txn.cost_center,
    txn.gl_code,
    txn.month,
    SUM(txn.debit - txn.credit)::numeric(18, 2) AS actual_net
  FROM sap_transaction AS txn
  INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
  WHERE batch.source_kind = 'actuals' AND batch.is_active
  GROUP BY txn.plant, txn.cost_center, txn.gl_code, txn.month
`);
