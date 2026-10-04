import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("a DUB and CHIR selection keeps source presence and active batches aligned for plant rows and their summed GL row", () => {
  const builder = new SqlBuilder();
  const byPlant = builder.build(domain, selection, user);
  const actualSource = byPlant.sql.match(/actual_src AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const relation = byPlant.sql.match(/financial_relation AS \(([\s\S]*?)\n\)\nSELECT/)?.[1] ?? "";
  const budgetSource = byPlant.sql.match(/budget_src AS \(([\s\S]*?)\n\), financial_relation/)?.[1] ?? "";

  assert.match(
    relation,
    /WHEN actual_src\.gl_code IS NULL THEN 'budget-only'[\s\S]*WHEN budget_src\.gl_code IS NULL THEN 'actual-only'[\s\S]*ELSE 'matched'/,
    "DUB is matched while CHIR, which has no joined budget row, is actual-only",
  );
  assert.match(actualSource, /WHERE plant IN \('CHIR', 'DUB'\)/);
  assert.match(budgetSource, /SELECT 'DUB'::text AS plant/);
  assert.match(budgetSource, /WHERE 'DUB' IN \('CHIR', 'DUB'\)/);
  assert.match(
    relation,
    /actual_src\.plant = budget_src\.plant AND actual_src\.gl_code = budget_src\.gl_code AND actual_src\.month = budget_src\.month/,
    "DUB's budget cannot join CHIR's actual row",
  );
  assert.match(
    byPlant.sql,
    /SELECT gl_code AS gl_code, plant AS plant,[\s\S]*jsonb_agg\(DISTINCT\(source_presence\)\)::text AS source_presence/,
  );
  assert.match(byPlant.sql, /GROUP BY gl_code, plant\n/);
  assert.match(
    byPlant.sql,
    /COALESCE\(to_jsonb\(array_agg\(DISTINCT\(to_jsonb\(budget_component_labels\)\)\) FILTER \(WHERE budget_component_labels IS NOT NULL\)\), '\[\]'::jsonb\)::text AS budget_component_labels/,
  );
  assert.match(
    byPlant.sql,
    /jsonb_build_object\('source', 'actuals', 'period', month::text, 'batchId', actual_batch_id\)/,
  );
  assert.match(
    byPlant.sql,
    /jsonb_build_object\('source', 'budget', 'period', month::text, 'batchId', budget_batch_id\)/,
  );
  assert.match(byPlant.sql, /FILTER \(WHERE actual_batch_id IS NOT NULL\)\), '\[\]'::jsonb/);
  assert.match(byPlant.sql, /FILTER \(WHERE budget_batch_id IS NOT NULL\)\), '\[\]'::jsonb/);
  assert.match(
    relation,
    /LEFT JOIN ingest_batch actual_batch[\s\S]*actual_src\.gl_code IS NOT NULL[\s\S]*actual_batch\.source_kind = 'actuals'[\s\S]*LEFT JOIN ingest_batch budget_batch[\s\S]*budget_src\.gl_code IS NOT NULL[\s\S]*budget_batch\.source_kind = 'budget'/,
    "CHIR receives its actual batch only; the budget batch predicate requires its missing budget row",
  );

  const summed = builder.build(domain, { ...selection, dimensionIds: ["gl_code"] }, user);
  assert.match(
    summed.sql,
    /SELECT gl_code AS gl_code,[\s\S]*jsonb_agg\(DISTINCT\(source_presence\)\)::text AS source_presence/,
    "the summed GL row retains both DUB's matched marker and CHIR's actual-only marker",
  );
  assert.match(summed.sql, /GROUP BY gl_code\n/);
  assert.doesNotMatch(summed.sql, /GROUP BY [^\n]*plant/);
  assert.match(
    summed.sql,
    /FILTER \(WHERE actual_batch_id IS NOT NULL\)[\s\S]*FILTER \(WHERE budget_batch_id IS NOT NULL\)/,
  );
  assert.ok(byPlant.objectsTouched.includes("ingest_batch"));
  assert.deepEqual(new SqlValidator().validate(byPlant.sql, byPlant.objectsTouched, 1000), { ok: true });
  assert.deepEqual(new SqlValidator().validate(summed.sql, summed.objectsTouched, 1000), { ok: true });
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
      allowedDimensions: ["gl_code", "month", "plant"],
      piiSensitive: false,
    },
    {
      id: "governed-financial.budget",
      label: "Budget",
      goldObject: "budget_by_gl_month",
      expr: "SUM(budget_net)",
      grain: "gl_code and month",
      impliedFilters: [],
      allowedDimensions: ["gl_code", "month", "plant"],
      piiSensitive: false,
    },
  ],
  dimensions: [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
    { id: "plant", label: "Plant", column: "plant" },
  ],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: domain.measures.map(({ id }) => id),
  dimensionIds: ["gl_code", "plant"],
  filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
  timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
};

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [
    { attribute: "plant", value: "CHIR" },
    { attribute: "plant", value: "DUB" },
  ],
};
