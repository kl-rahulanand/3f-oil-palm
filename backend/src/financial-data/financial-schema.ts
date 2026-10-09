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
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

type JsonRecord = Record<string, unknown>;
type CoverageEntry = { plantId: string; month: string; completeness: "confirmed" | "unconfirmed" };

export const agentFinancial = pgSchema("agent_financial");

function auditColumns() {
  return {
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    createdByActor: text("created_by_actor").notNull(),
  };
}

export const financialPlant = agentFinancial.table(
  "plant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sourceAliases: text("source_aliases").array().notNull().default([]),
    ...auditColumns(),
  },
  (table) => [unique("plant_code_unique").on(table.code)],
);

export const financialCostCenter = agentFinancial.table(
  "cost_center",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => financialPlant.id),
    sourceSystem: text("source_system").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sourceAliases: text("source_aliases").array().notNull().default([]),
    ...auditColumns(),
  },
  (table) => [
    unique("cost_center_source_plant_code_unique").on(table.sourceSystem, table.plantId, table.code),
    unique("cost_center_id_plant_unique").on(table.id, table.plantId),
    index("idx_cost_center_plant_id").on(table.plantId),
  ],
);

export const financialGlAccount = agentFinancial.table(
  "gl_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceSystem: text("source_system").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sourceAliases: text("source_aliases").array().notNull().default([]),
    ...auditColumns(),
  },
  (table) => [unique("gl_account_source_code_unique").on(table.sourceSystem, table.code)],
);

export const financialIngestionBatch = agentFinancial.table(
  "ingestion_batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    datasetKey: text("dataset_key").notNull(),
    sourceSystem: text("source_system").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    sourceChecksumSha256: text("source_checksum_sha256").notNull(),
    parserVersion: text("parser_version").notNull(),
    mappingVersion: text("mapping_version").notNull(),
    budgetOwnerPlantId: uuid("budget_owner_plant_id").references(() => financialPlant.id),
    state: text("state").notNull(),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    sourceReportingMonths: date("source_reporting_months").array().notNull().default([]),
    actualCoverage: jsonb("actual_coverage").$type<CoverageEntry[]>().notNull().default([]),
    budgetCoverage: jsonb("budget_coverage").$type<CoverageEntry[]>().notNull().default([]),
    sourceCounts: jsonb("source_counts").$type<JsonRecord>().notNull(),
    validationResult: jsonb("validation_result").$type<JsonRecord>().notNull(),
    reconciliationResult: jsonb("reconciliation_result").$type<JsonRecord>().notNull(),
    errors: jsonb("errors").$type<JsonRecord[]>().notNull().default([]),
    sourceModifiedAtUtc: timestamp("source_modified_at_utc", { withTimezone: true }),
    importedByActor: text("imported_by_actor").notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
    validatedAtUtc: timestamp("validated_at_utc", { withTimezone: true }),
    activatedAtUtc: timestamp("activated_at_utc", { withTimezone: true }),
  },
  (table) => [
    check(
      "ingestion_batch_state_check",
      sql`${table.state} IN ('staged', 'validated', 'active', 'superseded', 'failed')`,
    ),
    check("ingestion_batch_checksum_check", sql`${table.sourceChecksumSha256} ~ '^[0-9a-f]{64}$'`),
    unique("ingestion_batch_source_identity_unique").on(
      table.datasetKey,
      table.sourceChecksumSha256,
      table.parserVersion,
      table.mappingVersion,
    ),
    uniqueIndex("ingestion_batch_active_dataset_unique")
      .on(table.datasetKey)
      .where(sql`${table.state} = 'active'`),
    index("idx_ingestion_batch_budget_owner_plant_id").on(table.budgetOwnerPlantId),
  ],
);

export const financialBudgetComponent = agentFinancial.table(
  "nursery_budget_component",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => financialIngestionBatch.id),
    componentKey: text("component_key").notNull(),
    parentComponentId: uuid("parent_component_id"),
    sNo: text("s_no"),
    componentName: text("component_name").notNull(),
    depth: integer("depth").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isLeaf: boolean("is_leaf").notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    sourceRow: jsonb("source_row").$type<JsonRecord>().notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("nursery_budget_component_depth_check", sql`${table.depth} >= 0`),
    check("nursery_budget_component_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "nursery_budget_component_not_self_parent_check",
      sql`${table.parentComponentId} IS NULL OR ${table.parentComponentId} <> ${table.id}`,
    ),
    unique("nursery_budget_component_batch_id_unique").on(table.batchId, table.id),
    unique("nursery_budget_component_batch_key_unique").on(table.batchId, table.componentKey),
    foreignKey({
      name: "nursery_budget_component_parent_fk",
      columns: [table.batchId, table.parentComponentId],
      foreignColumns: [table.batchId, table.id],
    }),
    index("idx_nursery_budget_component_batch_id").on(table.batchId),
    index("idx_nursery_budget_component_parent_id").on(table.parentComponentId),
  ],
);

export const financialActual = agentFinancial.table(
  "financial_actual",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => financialIngestionBatch.id),
    sourceSystem: text("source_system").notNull(),
    transactionNumber: text("transaction_number").notNull(),
    lineId: text("line_id").notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    postingDate: date("posting_date").notNull(),
    reportingMonth: date("reporting_month")
      .notNull()
      .generatedAlwaysAs(sql`date_trunc('month', posting_date::timestamp)::date`),
    section: text("section"),
    plantId: uuid("plant_id").references(() => financialPlant.id),
    costCenterId: uuid("cost_center_id"),
    glAccountId: uuid("gl_account_id").references(() => financialGlAccount.id),
    sourcePlantCode: text("source_plant_code"),
    sourceCostCenterCode: text("source_cost_center_code"),
    sourceGlCode: text("source_gl_code"),
    sourceGlName: text("source_gl_name"),
    consideration: text("consideration"),
    shortName: text("short_name"),
    contraAccount: text("contra_account"),
    origin: text("origin"),
    location: text("location"),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull(),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull(),
    actualAmount: numeric("actual_amount", { precision: 18, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`debit - credit`),
    lineMemo: text("line_memo"),
    comment1: text("comment_1"),
    comment2: text("comment_2"),
    reference1: text("reference_1"),
    sourceRow: jsonb("source_row").$type<JsonRecord>().notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "financial_actual_cost_center_requires_plant_check",
      sql`${table.costCenterId} IS NULL OR ${table.plantId} IS NOT NULL`,
    ),
    unique("financial_actual_batch_source_line_unique").on(table.batchId, table.transactionNumber, table.lineId),
    foreignKey({
      name: "financial_actual_cost_center_plant_fk",
      columns: [table.costCenterId, table.plantId],
      foreignColumns: [financialCostCenter.id, financialCostCenter.plantId],
    }),
    index("idx_financial_actual_batch_id").on(table.batchId),
    index("idx_financial_actual_plant_month").on(table.plantId, table.reportingMonth),
    index("idx_financial_actual_gl_account_id").on(table.glAccountId),
    index("idx_financial_actual_cost_center_id").on(table.costCenterId),
  ],
);

export const financialBudget = agentFinancial.table(
  "nursery_budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => financialIngestionBatch.id),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => financialPlant.id),
    budgetComponentId: uuid("budget_component_id").notNull(),
    reportingMonth: date("reporting_month").notNull(),
    glAccountId: uuid("gl_account_id").references(() => financialGlAccount.id),
    paymentOffice: text("payment_office"),
    rolloverEnabled: boolean("rollover_enabled").notNull(),
    budgetAmount: numeric("budget_amount", { precision: 18, scale: 2 }).notNull(),
    rolloverAmount: numeric("rollover_amount", { precision: 18, scale: 2 }).notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    sourceRow: jsonb("source_row").$type<JsonRecord>().notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "nursery_budget_month_check",
      sql`${table.reportingMonth} = date_trunc('month', ${table.reportingMonth})::date`,
    ),
    unique("nursery_budget_batch_leaf_month_unique").on(
      table.batchId,
      table.plantId,
      table.budgetComponentId,
      table.reportingMonth,
    ),
    foreignKey({
      name: "nursery_budget_component_fk",
      columns: [table.batchId, table.budgetComponentId],
      foreignColumns: [financialBudgetComponent.batchId, financialBudgetComponent.id],
    }),
    index("idx_nursery_budget_batch_id").on(table.batchId),
    index("idx_nursery_budget_plant_month").on(table.plantId, table.reportingMonth),
    index("idx_nursery_budget_gl_account_id").on(table.glAccountId),
    index("idx_nursery_budget_component_id").on(table.budgetComponentId),
  ],
);

export const financialActualBudgetMapping = agentFinancial.table(
  "actual_budget_mapping",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mappingVersionId: uuid("mapping_version_id")
      .notNull()
      .references(() => financialIngestionBatch.id),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => financialPlant.id),
    costCenterId: uuid("cost_center_id").notNull(),
    glAccountId: uuid("gl_account_id")
      .notNull()
      .references(() => financialGlAccount.id),
    budgetComponentKey: text("budget_component_key").notNull(),
    approvalStatus: text("approval_status").notNull(),
    approvalReason: text("approval_reason"),
    approvedBy: text("approved_by").notNull(),
    provenance: jsonb("provenance").$type<JsonRecord>().notNull(),
    createdAtUtc: timestamp("created_at_utc", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("actual_budget_mapping_status_check", sql`${table.approvalStatus} IN ('approved', 'provisional')`),
    unique("actual_budget_mapping_tuple_unique").on(
      table.mappingVersionId,
      table.plantId,
      table.costCenterId,
      table.glAccountId,
    ),
    foreignKey({
      name: "actual_budget_mapping_cost_center_plant_fk",
      columns: [table.costCenterId, table.plantId],
      foreignColumns: [financialCostCenter.id, financialCostCenter.plantId],
    }),
    foreignKey({
      name: "actual_budget_mapping_component_fk",
      columns: [table.mappingVersionId, table.budgetComponentKey],
      foreignColumns: [financialBudgetComponent.batchId, financialBudgetComponent.componentKey],
    }),
    index("idx_actual_budget_mapping_component_key").on(table.mappingVersionId, table.budgetComponentKey),
    index("idx_actual_budget_mapping_gl_account_id").on(table.glAccountId),
  ],
);
