import { Injectable } from "@nestjs/common";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { loadConfig } from "../config";
import { SQL_BUILDER_MESSAGES } from "./sql.constants";

export interface BuiltQuery {
  sql: string;
  objectsTouched: string[];
}

export interface GovernedSelectionScope {
  triples: Array<{ plant: string; costCenter: string; glCode: string }>;
  glCodes: string[];
  masterGlCodes: string[];
  leafTargets?: Array<{
    plant: string;
    costCenter: string;
    glCode: string;
    target: { kind: "leaf"; leafKey: string } | { kind: "bucket" };
  }>;
}

export interface StatementProjectionPeriod {
  from: string;
  to: string;
}

/**
 * The ONE SQL-construction path (eng review C1). Composes SQL from a VALIDATED selection
 * using each measure's verified expr, and injects the RBAC row predicate from trusted
 * identity (never the question, never the model). The deterministic validator runs
 * afterward as an independent check.
 *
 * V1 scope: one gold object, except for the closed governed financial relation.
 */
@Injectable()
export class SqlBuilder {
  build(
    domain: DomainSpec,
    selection: Selection,
    user: AuthUser,
    includeProvenance = true,
    resolvedScope?: GovernedSelectionScope,
  ): BuiltQuery {
    if (domain.goldObject === "statement_relation") {
      const { from, to } = selection.timeWindow ?? {};
      if (!from || !to) throw new Error("Statement projection requires a period");
      return this.buildStatementProjection(user, { from, to }, resolvedScope);
    }
    const measures = selection.measureIds.map((id) => {
      const m = domain.measures.find((x) => x.id === id);
      if (!m) throw new Error(`unknown measure ${id}`);
      return m;
    });
    const goldObjects = new Set(measures.map((m) => m.goldObject));
    if (goldObjects.size > 1 && !domain.composed) {
      // TODO(A5): run per-object queries and merge in code by conformed dimension keys.
      throw new Error("cross-object composition not implemented in scaffold");
    }
    const goldObject = measures[0]?.goldObject ?? domain.goldObject;

    const dims = selection.dimensionIds
      .map((id) => domain.dimensions.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d);

    const selectCols = [
      ...dims.map((d) => `${d.column} AS ${d.id}`),
      ...measures.map((m) => `${m.expr} AS ${m.id.split(".").pop()}`),
    ];
    if (domain.composed && includeProvenance) {
      selectCols.push(
        "jsonb_agg(DISTINCT(source_presence))::text AS source_presence",
        "COALESCE(to_jsonb(array_agg(DISTINCT(to_jsonb(budget_component_labels))) FILTER (WHERE budget_component_labels IS NOT NULL)), '[]'::jsonb)::text AS budget_component_labels",
        "(COALESCE(to_jsonb(array_agg(DISTINCT(jsonb_build_object('source', 'actuals', 'period', month::text, 'batchId', actual_batch_id))) FILTER (WHERE actual_batch_id IS NOT NULL)), '[]'::jsonb) || COALESCE(to_jsonb(array_agg(DISTINCT(jsonb_build_object('source', 'budget', 'period', month::text, 'batchId', budget_batch_id))) FILTER (WHERE budget_batch_id IS NOT NULL)), '[]'::jsonb))::text AS active_batch_ids",
      );
    }
    if (measures.some((m) => m.piiSensitive)) {
      // Helper for k-suppression; stripped before user-facing results are returned.
      selectCols.push("COUNT(*) AS __group_count");
    }

    const where: string[] = [];
    // Implied (correctness) filters from every measure.
    for (const m of measures) where.push(...m.impliedFilters);
    // RBAC row predicate: inject the user's scope on the domain's scope column.
    let scopePredicate: string | undefined;
    let scopeValues: string[] = [];
    if (domain.scopeColumn) {
      scopeValues = user.scope.filter((s) => s.attribute === domain.scopeColumn).map((s) => s.value);
      if (scopeValues.length === 0) throw new Error(SQL_BUILDER_MESSAGES.missingScopeForScopedDomain);
      // TODO(B2: multi-column scope): DomainSpec currently supports one scope column only.
      scopePredicate = `${domain.scopeColumn} IN (${scopeValues.map((v) => this.lit(v)).join(", ")})`;
      if (!domain.composed) where.push(scopePredicate);
    }
    // User-selected filters.
    for (const f of selection.filters) {
      const dim = domain.dimensions.find((d) => d.id === f.dimensionId);
      if (!dim) continue;
      if (f.op === "in" && Array.isArray(f.value)) {
        where.push(`${dim.column} IN (${f.value.map((v) => this.lit(v)).join(", ")})`);
      } else if (typeof f.value === "string") {
        where.push(`${dim.column} ${f.op === "neq" ? "<>" : "="} ${this.lit(f.value)}`);
      }
    }
    let timePredicate: string | undefined;
    if (selection.timeWindow?.from && selection.timeWindow.to && selection.timeWindow.column) {
      const column = selection.timeWindow.column;
      if (!domain.dimensions.some((dimension) => dimension.column === column)) {
        throw new Error(SQL_BUILDER_MESSAGES.invalidTimeWindowColumn(column));
      }
      timePredicate = `${column} >= ${this.lit(selection.timeWindow.from)} AND ${column} < ${this.lit(
        this.nextIsoDate(selection.timeWindow.to),
      )}`;
      where.push(timePredicate);
    }

    const limit = Math.min(selection.limit ?? loadConfig().maxRows, loadConfig().maxRows);
    const groupColumns = dims.map((d) => d.column);
    const groupBy = groupColumns.length ? `\nGROUP BY ${[...new Set(groupColumns)].join(", ")}` : "";
    // Deterministic ordering so results (and pinned tiles that re-run) are stable across runs:
    // a date breakdown reads chronologically; any other breakdown reads largest-first by the
    // first measure (the warehouse otherwise returns an arbitrary, run-to-run-varying order).
    const dateDimension = dims.find((d) => /date|day/i.test(d.column));
    const primaryMeasureAlias = measures[0]?.id.split(".").pop();
    const orderBy = dateDimension
      ? `\nORDER BY ${dateDimension.column} ASC`
      : dims.length && primaryMeasureAlias
        ? `\nORDER BY ${primaryMeasureAlias} DESC`
        : "";
    const whereSql = where.length ? `\nWHERE ${where.join("\n  AND ")}` : "";

    const composedCtes = domain.composed
      ? this.composedCtes(domain.composed.sources, scopePredicate, scopeValues, timePredicate, resolvedScope)
      : undefined;
    const sql =
      (composedCtes ? `${composedCtes}\n` : "") +
      `SELECT ${selectCols.join(", ")}` +
      `\nFROM ${composedCtes ? "financial_relation" : goldObject}` +
      whereSql +
      groupBy +
      orderBy +
      `\nLIMIT ${limit}`;

    return {
      sql,
      objectsTouched: domain.composed
        ? [
            ...domain.composed.sources,
            ...(resolvedScope ? ["actual_by_key_month"] : []),
            "ingest_batch",
            "actual_src",
            "budget_src",
            "financial_relation",
          ]
        : [goldObject],
    };
  }

  private buildStatementProjection(
    user: AuthUser,
    period: StatementProjectionPeriod,
    resolvedScope?: GovernedSelectionScope,
  ): BuiltQuery {
    const scopeValues = user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
    if (!scopeValues.length) throw new Error(SQL_BUILDER_MESSAGES.missingScopeForScopedDomain);
    if (!resolvedScope?.leafTargets?.length) throw new Error("Statement projection requires resolved leaf targets");

    const periodEnd = this.lit(this.nextIsoDate(period.to));
    const periodStart = this.lit(period.from);
    const targetRows = resolvedScope.leafTargets.map(({ plant, costCenter, glCode, target }) =>
      [plant, costCenter, glCode, target.kind === "leaf" ? target.leafKey : "unmapped-GL"]
        .map((value) => this.lit(value))
        .join(", "),
    );
    const sql = `WITH leaf_targets(plant, cost_center, gl_code, leaf_key) AS (
  VALUES (${targetRows.join("),\n    (")})
), actual_by_leaf_month AS (
  SELECT target.leaf_key, actual.month,
    SUM(actual.actual_net)::numeric(18,2) AS actual_net
  FROM actual_by_key_month AS actual
  INNER JOIN leaf_targets AS target
    ON target.plant = actual.plant
      AND target.cost_center = actual.cost_center
      AND target.gl_code = actual.gl_code
  WHERE actual.plant IN (${scopeValues.map((value) => this.lit(value)).join(", ")})
    AND actual.month >= ${periodStart} AND actual.month < ${periodEnd}
  GROUP BY target.leaf_key, actual.month
), budget_src AS (
  SELECT leaf_key, month, budget_net, rollover_net
  FROM budget_by_leaf_month
  WHERE 'DUB' IN (${scopeValues.map((value) => this.lit(value)).join(", ")})
    AND month >= ${periodStart} AND month < ${periodEnd}
), outline_order AS (
  SELECT outline.leaf_key, batch.period AS month, outline.sort_order
  FROM mis_budget_outline AS outline
  INNER JOIN ingest_batch AS batch ON batch.id = outline.batch_id
  WHERE batch.source_kind = 'budget' AND batch.is_active AND outline.leaf_key IS NOT NULL
    AND batch.period >= ${periodStart} AND batch.period < ${periodEnd}
), statement_relation AS (
  SELECT COALESCE(actual_src.leaf_key, budget_src.leaf_key) AS leaf_key,
    COALESCE(actual_src.month, budget_src.month) AS month,
    COALESCE(actual_src.actual_net, 0)::numeric(18,2) AS actual_net,
    COALESCE(budget_src.budget_net, 0)::numeric(18,2) AS budget_net,
    COALESCE(budget_src.rollover_net, 0)::numeric(18,2) AS rollover_net,
    CASE
      WHEN actual_src.leaf_key IS NULL THEN 'budget-only'
      WHEN budget_src.leaf_key IS NULL THEN 'actual-only'
      ELSE 'matched'
    END AS source_presence,
    actual_batch.id AS actual_batch_id,
    budget_batch.id AS budget_batch_id
  FROM actual_by_leaf_month AS actual_src
  FULL OUTER JOIN budget_src
    ON actual_src.leaf_key = budget_src.leaf_key AND actual_src.month = budget_src.month
  LEFT JOIN ingest_batch AS actual_batch
    ON actual_src.leaf_key IS NOT NULL
      AND actual_batch.source_kind = 'actuals'
      AND actual_batch.period = COALESCE(actual_src.month, budget_src.month)
      AND actual_batch.is_active
  LEFT JOIN ingest_batch AS budget_batch
    ON budget_src.leaf_key IS NOT NULL
      AND budget_batch.source_kind = 'budget'
      AND budget_batch.period = COALESCE(actual_src.month, budget_src.month)
      AND budget_batch.is_active
)
SELECT relation.leaf_key, relation.month, relation.actual_net, relation.budget_net, relation.rollover_net,
  relation.source_presence, relation.actual_batch_id, relation.budget_batch_id
FROM statement_relation AS relation
LEFT JOIN outline_order AS outline
  ON outline.leaf_key = relation.leaf_key AND outline.month = relation.month
ORDER BY relation.month, outline.sort_order NULLS LAST, relation.leaf_key`;

    return {
      sql,
      objectsTouched: [
        "actual_by_key_month",
        "budget_by_leaf_month",
        "mis_budget_outline",
        "ingest_batch",
        "leaf_targets",
        "actual_by_leaf_month",
        "budget_src",
        "outline_order",
        "statement_relation",
      ],
    };
  }

  private composedCtes(
    [actualSource, budgetSource]: [string, string],
    scopePredicate: string | undefined,
    scopeValues: string[],
    timePredicate?: string,
    resolvedScope?: GovernedSelectionScope,
  ): string {
    if (!scopePredicate) throw new Error(SQL_BUILDER_MESSAGES.missingScopeForScopedDomain);
    const actualRelation = resolvedScope ? "actual_by_key_month" : actualSource;
    const actualProjection = resolvedScope
      ? "gl_code, month, SUM(actual_net)::numeric(18,2) AS actual_net"
      : "gl_code, month, actual_net";
    const triplePredicate = resolvedScope
      ? `\n    AND (plant, cost_center, gl_code) IN (${resolvedScope.triples
          .map(({ plant, costCenter, glCode }) => `(${this.lit(plant)}, ${this.lit(costCenter)}, ${this.lit(glCode)})`)
          .join(", ")})`
      : "";
    const actualGroupBy = resolvedScope ? "\n  GROUP BY gl_code, month" : "";
    const budgetPredicate = resolvedScope
      ? `\n    AND (gl_code IN (${resolvedScope.glCodes.map((value) => this.lit(value)).join(", ")}) OR gl_code NOT IN (${resolvedScope.masterGlCodes.map((value) => this.lit(value)).join(", ")}))`
      : "";
    return `WITH actual_src AS (
  SELECT ${actualProjection}
  FROM ${actualRelation}
  WHERE ${scopePredicate}${timePredicate ? `\n    AND ${timePredicate}` : ""}${triplePredicate}${actualGroupBy}
), budget_src AS (
  SELECT gl_code, month, budget_net, rollover_net, budget_component_labels
  FROM ${budgetSource}
  WHERE 'DUB' IN (${scopeValues.map((value) => this.lit(value)).join(", ")})${timePredicate ? `\n    AND ${timePredicate}` : ""}${budgetPredicate}
), financial_relation AS (
  SELECT COALESCE(actual_src.gl_code, budget_src.gl_code) AS gl_code,
    COALESCE(actual_src.month, budget_src.month) AS month,
    COALESCE(actual_src.actual_net, 0)::numeric(18,2) AS actual_net,
    COALESCE(budget_src.budget_net, 0)::numeric(18,2) AS budget_net,
    COALESCE(budget_src.rollover_net, 0)::numeric(18,2) AS rollover_net,
    budget_src.budget_component_labels,
    CASE
      WHEN actual_src.gl_code IS NULL THEN 'budget-only'
      WHEN budget_src.gl_code IS NULL THEN 'actual-only'
      ELSE 'matched'
    END AS source_presence,
    actual_batch.id AS actual_batch_id,
    budget_batch.id AS budget_batch_id
  FROM actual_src
  FULL OUTER JOIN budget_src
    ON actual_src.gl_code = budget_src.gl_code AND actual_src.month = budget_src.month
  LEFT JOIN ingest_batch actual_batch
    ON actual_src.gl_code IS NOT NULL
      AND actual_batch.source_kind = 'actuals'
      AND actual_batch.period = COALESCE(actual_src.month, budget_src.month)
      AND actual_batch.is_active
  LEFT JOIN ingest_batch budget_batch
    ON budget_src.gl_code IS NOT NULL
      AND budget_batch.source_kind = 'budget'
      AND budget_batch.period = COALESCE(actual_src.month, budget_src.month)
      AND budget_batch.is_active
)`;
  }

  /** Quote a trusted (validated) scope/filter value. TODO: replace literals with bind params. */
  private lit(v: string): string {
    return `'${v.replace(/'/g, "''")}'`;
  }

  private nextIsoDate(value: string): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
}
