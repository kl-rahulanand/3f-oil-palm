import { Injectable } from "@nestjs/common";
import type { AuthUser, DomainSpec, Selection } from "@pulse/contract";
import { loadConfig } from "../config";
import { SQL_BUILDER_MESSAGES } from "./sql.constants";

export interface BuiltQuery {
  sql: string;
  objectsTouched: string[];
}

/**
 * The ONE SQL-construction path (eng review C1). Composes SQL from a VALIDATED selection
 * using each measure's verified expr, and injects the RBAC row predicate from trusted
 * identity (never the question, never the model). The deterministic validator runs
 * afterward as an independent check.
 *
 * V1 scope: single gold object per query. Multi-measure across objects = per-object
 * queries merged in code by conformed keys (A5) — TODO, not a cross-object SQL join.
 */
@Injectable()
export class SqlBuilder {
  build(domain: DomainSpec, selection: Selection, user: AuthUser): BuiltQuery {
    const measures = selection.measureIds.map((id) => {
      const m = domain.measures.find((x) => x.id === id);
      if (!m) throw new Error(`unknown measure ${id}`);
      return m;
    });
    const goldObjects = new Set(measures.map((m) => m.goldObject));
    if (goldObjects.size > 1) {
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
    if (measures.some((m) => m.piiSensitive)) {
      // Helper for k-suppression; stripped before user-facing results are returned.
      selectCols.push("COUNT(*) AS __group_count");
    }

    const where: string[] = [];
    // Implied (correctness) filters from every measure.
    for (const m of measures) where.push(...m.impliedFilters);
    // RBAC row predicate: inject the user's scope on the domain's scope column.
    if (domain.scopeColumn) {
      const vals = user.scope
        .filter((s) => s.attribute === domain.scopeColumn)
        .map((s) => s.value);
      if (vals.length === 0) throw new Error(SQL_BUILDER_MESSAGES.missingScopeForScopedDomain);
      // TODO(B2: multi-column scope): DomainSpec currently supports one scope column only.
      where.push(`${domain.scopeColumn} IN (${vals.map((v) => this.lit(v)).join(", ")})`);
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
    if (selection.timeWindow?.from && selection.timeWindow.to && selection.timeWindow.column) {
      const column = selection.timeWindow.column;
      if (!domain.dimensions.some((dimension) => dimension.column === column)) {
        throw new Error(SQL_BUILDER_MESSAGES.invalidTimeWindowColumn(column));
      }
      where.push(
        `${column} >= ${this.lit(selection.timeWindow.from)} AND ${column} < ${this.lit(
          this.nextIsoDate(selection.timeWindow.to),
        )}`,
      );
    }

    const limit = Math.min(selection.limit ?? loadConfig().maxRows, loadConfig().maxRows);
    const groupBy = dims.length ? `\nGROUP BY ${dims.map((d) => d.column).join(", ")}` : "";
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

    const sql =
      `SELECT ${selectCols.join(", ")}` +
      `\nFROM ${goldObject}` +
      whereSql +
      groupBy +
      orderBy +
      `\nLIMIT ${limit}`;

    return { sql, objectsTouched: [goldObject] };
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
