import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
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
    raw: jsonb("raw").$type<Record<string, string>>().notNull().default({}),
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
    leafKey: text("leaf_key"),
    glCode: text("gl_code").notNull(),
    costCenter: text("cost_center").notNull(),
    budgetAmount: numeric("budget_amount", { precision: 18, scale: 2 }).notNull(),
    rolloverAmount: numeric("rollover_amount", { precision: 18, scale: 2 }).notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    updatedAtUtc: timestamp("updated_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mis_budget_period_month_check", sql`${table.period} = date_trunc('month', ${table.period})::date`),
    unique("mis_budget_batch_grain_unique").on(table.batchId, table.formatId, table.period, table.leafKey),
    index("idx_mis_budget_batch_id").on(table.batchId),
  ],
);

export const misBudgetOutline = pgTable(
  "mis_budget_outline",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => ingestBatch.id),
    nodeKey: text("node_key").notNull(),
    parentKey: text("parent_key"),
    depth: integer("depth").notNull(),
    sNo: text("s_no"),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    glCode: text("gl_code"),
    leafKey: text("leaf_key"),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    updatedAtUtc: timestamp("updated_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mis_budget_outline_depth_check", sql`${table.depth} >= 0`),
    check("mis_budget_outline_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "mis_budget_outline_leaf_check",
      sql`(${table.glCode} IS NULL AND ${table.leafKey} IS NULL) OR (${table.glCode} IS NOT NULL AND ${table.leafKey} IS NOT NULL)`,
    ),
    unique("mis_budget_outline_batch_node_unique").on(table.batchId, table.nodeKey),
    unique("mis_budget_outline_batch_leaf_unique").on(table.batchId, table.leafKey),
    foreignKey({
      name: "mis_budget_outline_parent_fk",
      columns: [table.batchId, table.parentKey],
      foreignColumns: [table.batchId, table.nodeKey],
    }),
    index("idx_mis_budget_outline_batch_id").on(table.batchId),
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

export const actualByGlMonth = pgView("actual_by_gl_month", {
  plant: text("plant").notNull(),
  glCode: text("gl_code").notNull(),
  month: date("month").notNull(),
  actualNet: numeric("actual_net", { precision: 18, scale: 2 }).notNull(),
}).as(sql`
  SELECT
    'DUB'::text AS plant,
    gl_code,
    month,
    SUM(actual_net)::numeric(18, 2) AS actual_net
  FROM actual_by_key_month
  WHERE plant = 'DUB'
  GROUP BY gl_code, month
`);

export const budgetByGlMonth = pgView("budget_by_gl_month", {
  glCode: text("gl_code").notNull(),
  month: date("month").notNull(),
  budgetNet: numeric("budget_net", { precision: 18, scale: 2 }).notNull(),
  rolloverNet: numeric("rollover_net", { precision: 18, scale: 2 }).notNull(),
  budgetComponentLabels: text("budget_component_labels").array().notNull(),
}).as(sql`
  SELECT
    b.gl_code,
    b.period AS month,
    SUM(b.budget_amount)::numeric(18, 2) AS budget_net,
    SUM(b.rollover_amount)::numeric(18, 2) AS rollover_net,
    array_agg(DISTINCT b.cost_center ORDER BY b.cost_center) AS budget_component_labels
  FROM mis_budget AS b
  INNER JOIN ingest_batch AS bt ON bt.id = b.batch_id
  WHERE bt.source_kind = 'budget' AND bt.is_active
  GROUP BY b.gl_code, b.period
`);

export const budgetByLeafMonth = pgView("budget_by_leaf_month", {
  leafKey: text("leaf_key").notNull(),
  month: date("month").notNull(),
  budgetNet: numeric("budget_net", { precision: 18, scale: 2 }).notNull(),
  rolloverNet: numeric("rollover_net", { precision: 18, scale: 2 }).notNull(),
}).as(sql`
  SELECT
    b.leaf_key,
    b.period AS month,
    SUM(b.budget_amount)::numeric(18, 2) AS budget_net,
    SUM(b.rollover_amount)::numeric(18, 2) AS rollover_net
  FROM mis_budget AS b
  INNER JOIN ingest_batch AS bt ON bt.id = b.batch_id
  INNER JOIN mis_budget_outline AS outline
    ON outline.batch_id = b.batch_id AND outline.leaf_key = b.leaf_key
  WHERE bt.source_kind = 'budget' AND bt.is_active
  GROUP BY b.leaf_key, b.period
`);
