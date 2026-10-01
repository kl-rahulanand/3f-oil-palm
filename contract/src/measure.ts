// Gate 0 — the typed measure-spec (eng review A1/A2).
// Measures live as version-controlled files in the backend repo and are CI-gated
// by the golden-answer suite. The LLM SELECTS these; it never authors SQL.

/** How a surface should render a measure's value.
 *  "percent" - a 0..1 ratio, rendered as a percentage.
 *  "money"   - a fixed-scale Rupee amount, rendered with the Indian digit grouping. */
export type MeasureFormat = "percent" | "money";

/** A verified metric. Its SQL expression is human-signed-off once, then reused. */
export interface MeasureSpec {
  /** Domain-qualified id, e.g. "domain.metric" (never bare). */
  id: string;
  /** Human label shown in chips / titles. */
  label: string;
  /** Alternate business phrases the selector may use for this measure. */
  synonyms?: string[];
  /** The single pre-joined gold object this measure reads (no query-time joins). */
  goldObject: string;
  /** The verified aggregation expression, e.g. "COUNT(DISTINCT order_number)". */
  expr: string;
  /** Grain note for reviewers (what one row of the gold object represents). */
  grain: string;
  /** Filters always applied for correctness, e.g. ["record_type <> 'TEST'"]. */
  impliedFilters: string[];
  /** Dimensions this measure may be sliced by (ids must exist in the domain). */
  allowedDimensions: string[];
  /** The column used for time-window filters, if the measure is time-bound. */
  timeColumn?: string;
  /** Preferred grain when the author configured a time-aware measure. */
  defaultTimeGrain?: TimeGrain;
  /** Display hint for surfaces; see MeasureFormat. */
  format?: MeasureFormat;
  /** Aggregate expression over selected aliases when filtered grouped rows are totalled. */
  totalsOverAliases?: string;
  /** True if this measure is meaningless/misleading without a bounded time window
   *  (e.g. event-stream counts that otherwise scan all history). Drives the D3
   *  required-time-window clarify gate. */
  requiresTimeWindow?: boolean;
  /** True if aggregates over this measure need min-cell-size suppression (k=5). */
  piiSensitive: boolean;
  /** True if this measure is high-stakes enough to be reconciled in production (D5). */
  critical?: boolean;
  /** D5 reconciliation: a SECOND, independently-written expression that must equal `expr`
   *  (within `tolerance`) over the same gold object. Divergence => investigate (neither side
   *  is assumed canonical). */
  reconciliation?: { altExpr: string; tolerance: number };
}

/** A sliceable attribute, e.g. { id: "bank", column: "bank_code" }. */
export interface DimensionSpec {
  id: string;
  label: string;
  column: string;
}

/** A domain = one pre-joined gold table + its semantic pack (eng review). */
export interface DomainSpec {
  /** Stable domain identifier. */
  name: string;
  label: string;
  goldObject: string;
  /** Builder-only marker for the governed Actual/Budget relation. */
  composed?: {
    sources: [actual: string, budget: string];
    joinKeys: ["gl_code", "month"] | ["leaf_key", "month"];
  };
  /** Column used to compute the gold object's data freshness watermark. */
  freshnessColumn?: string;
  /** Deterministic routing hints (V1 uses no embeddings). */
  routingHints: string[];
  measures: MeasureSpec[];
  dimensions: DimensionSpec[];
  /** Scope column carrying row-level security value, e.g. "region_code". */
  scopeColumn?: string;
  /** PII/never-return leaf columns for this domain's gold object. */
  blockedColumns?: string[];
}

export type TimeGrain = "day" | "week" | "month";

export type MeasureAggregation = "count" | "count_distinct" | "sum" | "average" | "minimum" | "maximum";

export type MeasureFilterOperator = "eq" | "neq" | "in" | "is_not_null";
export type AuthoredMeasureStatus = "draft" | "validated" | "published";
export type MeasureDisplayFormat = "number" | "percent";

export interface AuthoredMeasureFilter {
  fieldId: string;
  operator: MeasureFilterOperator;
  values: string[];
}

export interface AuthoredMeasureInput {
  domain: string;
  key: string;
  label: string;
  synonyms: string[];
  baseField: string;
  aggregation: MeasureAggregation;
  timeDimension?: string;
  timeGrain?: TimeGrain;
  filters: AuthoredMeasureFilter[];
  format: MeasureDisplayFormat;
}

export interface AuthorableFieldSpec {
  id: string;
  label: string;
  dataType: "text" | "number" | "date";
  aggregations: MeasureAggregation[];
  filterOperators: MeasureFilterOperator[];
}

export interface MeasureAuthoringDomain {
  id: string;
  label: string;
  fields: AuthorableFieldSpec[];
  timeDimensions: Array<{ id: string; label: string }>;
}

export interface MeasureAuthoringMetadataResponse {
  domains: MeasureAuthoringDomain[];
  aggregations: Array<{ id: MeasureAggregation; label: string }>;
  formats: Array<{ id: MeasureDisplayFormat; label: string }>;
}

export interface AuthoredMeasureView extends AuthoredMeasureInput {
  id: string;
  measureId: string;
  version: number;
  status: AuthoredMeasureStatus;
  definitionHash: string;
  validation?: {
    value: string | number | null;
    sql: string;
    validatedAt: string;
  };
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface MeasureValidationResponse {
  measure: AuthoredMeasureView;
  value: string | number | null;
  sql: string;
}

/** The structured selection the LLM produces — NOT SQL. Validated before use. */
export interface Selection {
  domain: string;
  measureIds: string[];
  dimensionIds: string[];
  filters: SelectionFilter[];
  measureFilters?: MeasureFilter[];
  timeWindow?: { grain: TimeGrain; last?: number; from?: string; to?: string; column?: string };
  limit?: number;
}

export type MeasureFilterOp = "gt" | "gte" | "lt" | "lte";

export type MeasureFilterOperand = { kind: "measure"; measureId: string } | { kind: "value"; value: string };

export interface MeasureFilter {
  measureId: string;
  op: MeasureFilterOp;
  compareTo: MeasureFilterOperand;
}

export interface SelectionFilter {
  dimensionId: string;
  op: "eq" | "in" | "neq";
  value: string | string[];
}
