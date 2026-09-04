import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AuthoredMeasureFilter,
  ChartView,
  ConversationAnswerSnapshot,
  MeasureSpec,
  Selection,
} from "@3f/contract";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authoredMeasures = pgTable(
  "authored_measures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    measureKey: text("measure_key").notNull(),
    version: integer("version").notNull().default(1),
    domain: text("domain").notNull(),
    label: text("label").notNull(),
    synonyms: text("synonyms").array().notNull().default(sql`ARRAY[]::text[]`),
    baseField: text("base_field").notNull(),
    aggregation: text("aggregation").notNull(),
    timeDimension: text("time_dimension"),
    timeGrain: text("time_grain"),
    filters: jsonb("filters").$type<AuthoredMeasureFilter[]>().notNull().default(sql`'[]'::jsonb`),
    format: text("format").notNull().default("number"),
    status: text("status").notNull().default("draft"),
    definitionHash: text("definition_hash").notNull(),
    validatedHash: text("validated_hash"),
    validationSql: text("validation_sql"),
    validationValue: jsonb("validation_value").$type<string | number | null>(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    compiledSpec: jsonb("compiled_spec").$type<MeasureSpec>(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    updatedBy: uuid("updated_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    measureVersionUnique: uniqueIndex("authored_measures_key_version_unique").on(
      table.measureKey,
      table.version,
    ),
    statusIdx: index("authored_measures_status_idx").on(table.status),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("conversations_user_idx").on(table.userId),
  }),
);

export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    question: text("question").notNull(),
    selection: jsonb("selection").$type<Selection>().notNull(),
    answerSnapshot: jsonb("answer_snapshot").$type<ConversationAnswerSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationOrdinalIdx: index("conversation_turns_conversation_ordinal_idx").on(
      table.conversationId,
      table.ordinal,
    ),
  }),
);

export const roles = pgTable("roles", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role")
      .notNull()
      .references(() => roles.name, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.role] }),
  }),
);

export const rolePerms = pgTable(
  "role_perms",
  {
    role: text("role")
      .notNull()
      .references(() => roles.name, { onDelete: "cascade" }),
    grantType: text("grant_type").notNull(),
    grantId: text("grant_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.role, table.grantType, table.grantId] }),
  }),
);

export const userScope = pgTable(
  "user_scope",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(),
    value: text("value").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.attribute, table.value] }),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId),
  }),
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("otp_codes_user_idx").on(table.userId),
  }),
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jti: text("jti").notNull().unique(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ua: text("ua"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_idx").on(table.userId),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").notNull(),
    userId: uuid("user_id"),
    sessionId: uuid("session_id"),
    conversationId: uuid("conversation_id"),
    question: text("question"),
    selection: jsonb("selection"),
    generatedSql: text("generated_sql"),
    objectsTouched: text("objects_touched").array(),
    responseClass: text("response_class"),
    latencyMs: integer("latency_ms"),
    modelId: text("model_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
  },
  (table) => ({
    userTsIdx: index("audit_events_user_ts_idx").on(table.userId, table.ts),
  }),
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    measureId: text("measure_id").notNull(),
    primaryValue: text("primary_value"),
    altValue: text("alt_value"),
    diff: doublePrecision("diff"),
    withinTolerance: boolean("within_tolerance").notNull(),
    status: text("status").notNull(),
  },
  (table) => ({
    measureRanAtIdx: index("reconciliation_runs_measure_ran_at_idx").on(
      table.measureId,
      table.ranAt,
    ),
  }),
);

export const savedQueries = pgTable("saved_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  selection: jsonb("selection").notNull(),
  chartType: text("chart_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardPins = pgTable("dashboard_pins", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  selection: jsonb("selection").notNull(),
  chartType: text("chart_type"),
  viewPrefs: jsonb("view_prefs").$type<ChartView>(),
  definitionVersion: text("definition_version"),
  refreshCadence: text("refresh_cadence"),
  lastRefresh: timestamp("last_refresh", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pinSnapshots = pgTable("pin_snapshots", {
  pinId: uuid("pin_id")
    .primaryKey()
    .references(() => dashboardPins.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  resultJson: jsonb("result_json"),
  chartType: text("chart_type"),
  dataAsOf: timestamp("data_as_of", { withTimezone: true }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  errorMessage: text("error_message"),
});
