// Gate 0 — the HTTP API contract shared by frontend + backend.

import { z } from "zod";
import type { Selection, SelectionFilter } from "./measure";
import { authUserSchema } from "./rbac";
import type { ScopeAttr } from "./rbac";

/** Every backend answer maps to exactly one of these (POC taxonomy). */
export enum ResponseClass {
  Success = "success",
  Informational = "informational",
  ClarificationNeeded = "clarification_needed",
  BlockedByPolicy = "blocked_by_policy",
  NotSupported = "not_supported",
  ExecutionFailed = "execution_failed",
  BackendError = "backend_error",
}

export const emptyBodySchema = z.object({}).strict();

/** POST /api/auth/otp/request */
export const authOtpRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export const authOtpRequestResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

/** POST /api/auth/otp/verify */
export const authOtpVerifyRequestSchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const authOtpVerifyResponseSchema = authUserSchema;

/** POST /api/auth/refresh */
export const authRefreshRequestSchema = emptyBodySchema;
export const authRefreshResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

/** POST /api/auth/logout */
export const authLogoutRequestSchema = emptyBodySchema;
export const authLogoutResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

/** GET /api/auth/me */
export const authMeResponseSchema = authUserSchema;

export type AuthOtpRequest = z.infer<typeof authOtpRequestSchema>;
export type AuthOtpRequestResponse = z.infer<typeof authOtpRequestResponseSchema>;
export type AuthOtpVerifyRequest = z.infer<typeof authOtpVerifyRequestSchema>;
export type AuthOtpVerifyResponse = z.infer<typeof authOtpVerifyResponseSchema>;
export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>;
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;
export type AuthLogoutRequest = z.infer<typeof authLogoutRequestSchema>;
export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

/** POST /api/chat — ask a question. */
export interface AskReportGrounding {
  reportId: string;
  timeWindow?: { from: string; to: string; column?: string };
}

export interface AskRequest {
  question: string;
  /** Session id for multi-turn context (chips). Server-issued. */
  sessionId?: string;
  /** Client-generated conversation/thread id for independent multi-turn context. */
  conversationId?: string;
  /** Durable turn to replace when re-running an edited selection. */
  turnId?: string;
  /** Optional edited chips when the user tweaks the interpretation. */
  selection?: Selection;
  /** Optional server-resolved report grounding; the client sends no semantic Selection. */
  reportGrounding?: AskReportGrounding;
}

/** An editable interpretation chip shown under the question. */
export interface Chip {
  kind: "measure" | "dimension" | "filter" | "timeWindow";
  id: string;
  label: string;
}

/** A rendered answer column + rows (chart/table both read from this). */
export interface ResultTable {
  columns: { key: string; label: string; numeric: boolean; format?: "percent" }[];
  rows: Array<Record<string, string | number | null>>;
  /** Cells blanked by k-anonymity suppression; corresponding row values are null. */
  suppressedCells?: Array<{ row: number; key: string }>;
}

export type ChartType = "kpi" | "line" | "bar" | "pie" | "table";

export interface ChartView {
  chartType?: ChartType;
  axisSwapped?: boolean;
  sort?: { key: string; direction: "asc" | "desc" } | null;
}

/** Curated, server-owned report shown in Dashboard > My Reports. */
export interface ReportSummary {
  id: string;
  title: string;
  description: string;
  domain: string;
  chartType: ChartType;
  approximate?: boolean;
  note?: string;
}

/** POST /api/reports/:id/run */
export interface ReportRunResult {
  id: string;
  title: string;
  description: string;
  result: ResultTable;
  chartType: ChartType;
  primaryMeasureId: string;
  approximate?: boolean;
  note?: string;
  dataAsOf: string | null;
  appliedTimeWindow: { from: string; to: string; column: string } | null;
  dateColumns: { value: string; label: string }[];
  defaultDateColumn: string | null;
}

export interface PinSnapshot {
  status: "ok" | "error" | "access_revoked";
  result?: ResultTable;
  chartType?: ChartType;
  dataAsOf?: string | null;
  computedAt: string;
  errorMessage?: string;
}

/** Saved semantic selection for re-running through the normal chat path. */
export interface SavedQuery {
  id: string;
  selection: Selection;
  chartType?: ChartType;
  createdAt: string;
}

/** POST /api/saved */
export interface SaveQueryRequest {
  selection: Selection;
  chartType?: ChartType;
}

/** Personal dashboard pin bound to the semantic definitions used at creation. */
export interface Pin {
  id: string;
  title: string;
  selection: Selection;
  chartType?: ChartType;
  view?: ChartView;
  definitionVersion: string;
  definitionChanged: boolean;
  position: number;
  createdAt: string;
  lastRefresh?: string;
  snapshot?: PinSnapshot;
}

/** POST /api/pins */
export interface CreatePinRequest {
  title?: string;
  selection: Selection;
  chartType?: ChartType;
  view?: ChartView;
}

/** PATCH /api/pins/:id/view */
export interface UpdatePinViewRequest {
  view: ChartView;
}

/** PATCH /api/pins/reorder */
export interface ReorderPinsRequest {
  orderedIds: string[];
}

/** Trust strip payload (ambient verification). */
export interface ProvenanceMeasure {
  id: string;
  label: string;
  expr: string;
  grain: string;
  impliedFilters: string[];
}

export interface Provenance {
  verified: boolean;
  measureIds: string[];
  measures: ProvenanceMeasure[];
  impliedFilters: string[];
  scope: string;
  readback: string;
  /** Data freshness (gold watermark), distinct from query time. */
  dataAsOf: string | null;
  sql: string;
}

export interface AskResponse {
  responseClass: ResponseClass;
  sessionId: string;
  /** Present for code-composed glossary/help answers. */
  kind?: "informational";
  term?: string;
  definitionKind?: "measure" | "dimension" | "value" | "meta";
  definition?: string;
  suggestedQuestions?: string[];
  /** Durable turn created or replaced by this successful ask. */
  turnId?: string;
  /** True only when prior durable turns were supplied to the LLM for this answer. */
  usedPriorContext?: boolean;
  /** Present on Success. */
  title?: string;
  chips?: Chip[];
  /** The fully-resolved selection behind this answer (present on Success), so the client
   *  can save/pin/edit it and re-run deterministically. Never SQL — just the selection. */
  selection?: Selection;
  result?: ResultTable;
  /** Ungrouped aggregate value per measure output-key (e.g. { lead_count: 1939 }), present
   *  on Success only when the answer has a breakdown (dimensions). The client shows this as
   *  the headline total instead of summing the visible rows, which over/under-counts for
   *  COUNT(DISTINCT ...) and ratio measures. Keyed by the measure's output key (id after the dot). */
  totals?: Record<string, number>;
  /** Deterministically chosen chart default for this result shape. */
  chartType?: ChartType;
  /** Chart types the client may switch to without re-querying. */
  availableChartTypes?: ChartType[];
  /** Domain fields the user may add/remove from the selected answer grain. */
  availableFields?: {
    dimensions: { id: string; label: string; values?: string[] }[];
    measures: { id: string; label: string }[];
  };
  provenance?: Provenance;
  /** Concrete date range applied to the query, for editable date filters. */
  appliedTimeWindow?: { from: string; to: string; column: string };
  /** Concrete dimension filters applied to the query, for editable value filters. */
  appliedFilters?: SelectionFilter[];
  /** Human-readable, honest message for non-success classes. */
  message?: string;
  /** For ClarificationNeeded — options the user can pick. */
  clarify?: { prompt: string; options: string[]; defaultOption?: string; resumesQuestion?: boolean };
  latencyMs?: number;
}

export type ChatStreamEvent =
  | { type: "phase"; phase: "routing" | "selecting" | "querying" | "summarizing" }
  | { type: "token"; text: string }
  | { type: "result"; response: AskResponse }
  | { type: "error"; message: string; responseClass: ResponseClass };

export interface HelpMeasure {
  id: string;
  label: string;
  definition: string;
  synonyms: string[];
}

export interface HelpDimension {
  id: string;
  label: string;
  definition?: string;
}

export interface HelpFilterExample {
  dimensionLabel: string;
  values: string[];
}

export interface HelpSampleQuestion {
  question: string;
  behaviour: string;
}

export interface HelpResponse {
  gettingStarted: string[];
  whatYouCanAsk: {
    measures: HelpMeasure[];
    dimensions: Array<{ id: string; label: string }>;
    filterExamples: HelpFilterExample[];
    timeframes: string[];
    sampleQuestions: HelpSampleQuestion[];
  };
  whatItWont: string[];
  access: {
    roles: string[];
    domains: string[];
    measures: string[];
    dimensions: string[];
    scope: ScopeAttr[];
    rolesReference: Array<{ role: string; summary: string }>;
  };
}

/** Render-essential answer state persisted for reopening a conversation turn. */
export interface ConversationAnswerSnapshot {
  title?: AskResponse["title"];
  chips?: AskResponse["chips"];
  result?: AskResponse["result"];
  chartType?: AskResponse["chartType"];
  totals?: AskResponse["totals"];
  provenance?: AskResponse["provenance"];
  usedPriorContext?: AskResponse["usedPriorContext"];
  // Persisted so the field/filter editor (Add field, applied filters, applied date
  // range) survives a conversation reopen — not just the read-only result.
  availableFields?: AskResponse["availableFields"];
  appliedFilters?: AskResponse["appliedFilters"];
  appliedTimeWindow?: AskResponse["appliedTimeWindow"];
}

/** GET /api/conversations list item and conversation mutation response. */
export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTurnView {
  id: string;
  ordinal: number;
  question: string;
  selection: Selection;
  answer: ConversationAnswerSnapshot;
  createdAt: string;
}

/** GET /api/conversations/:id response. */
export interface ConversationDetail extends ConversationSummary {
  turns: ConversationTurnView[];
}

/** POST /api/conversations request. */
export interface CreateConversationRequest {
  title?: string;
}

/** PATCH /api/conversations/:id request. */
export interface RenameConversationRequest {
  title: string;
}

/** POST /api/admin/users — admin-only user provisioning (A2b). */
export interface CreateUserRequest {
  email: string;
  display_name: string;
  roles: string[];
  /** Scope attributes validated against real gold values at save time. */
  scope: ScopeAttr[];
}

/** PATCH /api/admin/users/:id — admin-only user updates (A2b). */
export interface UpdateUserRequest {
  roles?: string[];
  scope?: ScopeAttr[];
  is_active?: boolean;
}

/** Admin-facing user shape; never includes passwordHash. */
export interface AdminUserView {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  scope: ScopeAttr[];
  is_active: boolean;
  createdAt: string;
}

export interface AccessMetadataRole {
  id: string;
  label: string;
}

export interface AccessMetadataScopeAttribute {
  id: string;
  label: string;
  values: string[];
}

export interface AccessMetadataGrantOption {
  id: string;
  label: string;
}

/** GET /api/admin/access-metadata. */
export interface AccessMetadataResponse {
  roles: AccessMetadataRole[];
  scopeAttributes: AccessMetadataScopeAttribute[];
  grantOptions: {
    domains: AccessMetadataGrantOption[];
    measures: AccessMetadataGrantOption[];
    dimensions: AccessMetadataGrantOption[];
    actions: string[];
  };
}

/** GET /api/admin/usage. */
export interface AdminUsageRow {
  userId: string;
  email: string | null;
  queryCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastActivityAt: string | null;
}

export type AdminUsageGranularity = "day" | "month";

export interface AdminUsagePoint {
  bucketStart: string;
  queryCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** GET /api/admin/usage/series. */
export interface AdminUsageSeriesResponse {
  granularity: AdminUsageGranularity;
  points: AdminUsagePoint[];
}
