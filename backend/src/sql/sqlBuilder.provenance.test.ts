import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("the composed relation projects row aligned provenance a source presence marker of matched budget only or actual only from which full outer join side is null the deterministic Budget Components label set and the active actuals and budget batch ids for each month and adds ingest batch to the objects touched so the validator still allows the composed query", () => {
  const built = new SqlBuilder().build(domain, selection, user);

  assert.match(
    built.sql,
    /WHEN actual_src\.gl_code IS NULL THEN 'budget-only'[\s\S]*WHEN budget_src\.gl_code IS NULL THEN 'actual-only'[\s\S]*ELSE 'matched'/,
  );
  assert.match(built.sql, /jsonb_agg\(DISTINCT\(source_presence\)\)::text AS source_presence/);
  assert.match(
    built.sql,
    /COALESCE\(to_jsonb\(array_agg\(DISTINCT\(to_jsonb\(budget_component_labels\)\)\) FILTER \(WHERE budget_component_labels IS NOT NULL\)\), '\[\]'::jsonb\)::text AS budget_component_labels/,
  );
  assert.match(
    built.sql,
    /jsonb_build_object\('source', 'actuals', 'period', month::text, 'batchId', actual_batch_id\)/,
  );
  assert.match(
    built.sql,
    /jsonb_build_object\('source', 'budget', 'period', month::text, 'batchId', budget_batch_id\)/,
  );
  assert.match(built.sql, /FILTER \(WHERE actual_batch_id IS NOT NULL\)\), '\[\]'::jsonb/);
  assert.match(built.sql, /FILTER \(WHERE budget_batch_id IS NOT NULL\)\), '\[\]'::jsonb/);
  assert.match(
    built.sql,
    /LEFT JOIN ingest_batch actual_batch[\s\S]*actual_batch\.source_kind = 'actuals'[\s\S]*LEFT JOIN ingest_batch budget_batch[\s\S]*budget_batch\.source_kind = 'budget'/,
  );
  assert.match(built.sql, /GROUP BY gl_code, month/);

  const coarser = new SqlBuilder().build(domain, { ...selection, dimensionIds: ["gl_code"] }, user);
  assert.match(coarser.sql, /GROUP BY gl_code\n/);
  assert.doesNotMatch(coarser.sql, /GROUP BY [^\n]*month/);
  assert.ok(built.objectsTouched.includes("ingest_batch"));
  assert.deepEqual(new SqlValidator().validate(built.sql, built.objectsTouched, 1000), { ok: true });
  assert.deepEqual(new SqlValidator().validate(coarser.sql, coarser.objectsTouched, 1000), { ok: true });
});

const domain: DomainSpec = {
  name: "governed-financial",
  label: "Governed financial",
  goldObject: "actual_by_gl_month",
  composed: { sources: ["actual_by_gl_month", "budget_by_gl_month"], joinKeys: ["gl_code", "month"] },
  routingHints: [],
  scopeColumn: "plant",
  measures: [
    {
      id: "governed-financial.actual",
      label: "Actual",
      goldObject: "actual_by_gl_month",
      expr: "SUM(actual_net)",
      grain: "gl_code and month",
      impliedFilters: [],
      allowedDimensions: ["gl_code", "month"],
      piiSensitive: false,
    },
  ],
  dimensions: [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
  ],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: [domain.measures[0].id],
  dimensionIds: domain.dimensions.map(({ id }) => id),
  filters: [],
};

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
