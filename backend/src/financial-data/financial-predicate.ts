import { financialSelectionSchema, type FinancialDimensionId, type FinancialSelection } from "@3f/contract";
import type { Pool, PoolClient, QueryConfig } from "pg";

const DATASET_KEY = "financial-chat-workbook";
const UNMAPPED_COMPONENT_KEY = "unmapped-GL";

type QueryHost = Pick<Pool | PoolClient, "query">;
type SelectionFilter = FinancialSelection["filters"][number];
type FilterOperator = SelectionFilter["operator"];
type CellIdentity = Partial<Record<FinancialDimensionId, string | null>>;

interface ResolvedFilter {
  dimensionId: FinancialDimensionId;
  operator: FilterOperator;
  values: readonly (string | null)[];
}

export interface ResolvedFinancialScope {
  readonly sourceBatchIds: readonly string[];
  readonly mappingVersionId: string;
  readonly plantIds: readonly string[];
  readonly plantRecordIds: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly grouping: readonly FinancialDimensionId[];
  readonly cellIdentity: Readonly<CellIdentity>;
  readonly filters: readonly ResolvedFilter[];
  readonly componentKeys: readonly string[];
}

export type FinancialActualQueryKind = "summary" | "detail";

export async function resolveFinancialScope(
  database: QueryHost,
  input: FinancialSelection,
  cellIdentity: CellIdentity = {},
): Promise<ResolvedFinancialScope> {
  const selection = financialSelectionSchema.parse(input);
  assertCellIdentity(selection.dimensionIds, cellIdentity);

  const batch = await database.query<{ id: string }>(
    `SELECT id
       FROM agent_financial.ingestion_batch
      WHERE dataset_key = $1 AND state = 'active'
      ORDER BY activated_at_utc DESC, id
      LIMIT 1`,
    [DATASET_KEY],
  );
  const mappingVersionId = batch.rows[0]?.id;
  if (!mappingVersionId) throw new Error("Financial data is not loaded");

  const plants = await database.query<{ id: string; code: string }>(
    `SELECT id, code
       FROM agent_financial.plant
      WHERE code = ANY($1::text[])
      ORDER BY code`,
    [selection.plantIds],
  );
  const plantRecordIdsByCode = new Map(plants.rows.map(({ id, code }) => [code, id]));
  const plantRecordIds = selection.plantIds.map((code) => plantRecordIdsByCode.get(code));
  if (plantRecordIds.some((id) => !id)) throw new Error("Financial selection references an unknown Plant");

  const filters = selection.filters.map(normalizeFilter);
  for (const dimensionId of selection.dimensionIds) {
    if (!(dimensionId in cellIdentity)) continue;
    filters.push({ dimensionId, operator: "eq", values: [cellIdentity[dimensionId] ?? null] });
  }
  const componentRoots = [
    ...new Set(
      filters
        .filter(({ dimensionId }) => dimensionId === "nursery_component")
        .flatMap(({ values }) => values)
        .filter((value): value is string => value !== null && value !== UNMAPPED_COMPONENT_KEY),
    ),
  ];
  const descendants = await resolveComponentDescendants(database, mappingVersionId, componentRoots);
  const resolvedFilters = filters.map((filter) =>
    filter.dimensionId === "nursery_component"
      ? {
          ...filter,
          values: [
            ...new Set(
              filter.values.flatMap((value) =>
                value === null || value === UNMAPPED_COMPONENT_KEY ? [value] : (descendants.get(value) ?? []),
              ),
            ),
          ],
        }
      : filter,
  );
  const componentKeys = [
    ...new Set(
      resolvedFilters
        .filter(({ dimensionId }) => dimensionId === "nursery_component")
        .flatMap(({ values }) => values)
        .filter((value): value is string => value !== null),
    ),
  ].sort();

  return Object.freeze({
    sourceBatchIds: Object.freeze([mappingVersionId]),
    mappingVersionId,
    plantIds: Object.freeze([...selection.plantIds]),
    plantRecordIds: Object.freeze(plantRecordIds as string[]),
    from: selection.timeWindow.from,
    to: selection.timeWindow.to,
    grouping: Object.freeze([...selection.dimensionIds]),
    cellIdentity: Object.freeze({ ...cellIdentity }),
    filters: Object.freeze(resolvedFilters.map((filter) => Object.freeze({ ...filter, values: [...filter.values] }))),
    componentKeys: Object.freeze(componentKeys),
  });
}

export function buildFinancialActualQuery(scope: ResolvedFinancialScope, kind: FinancialActualQueryKind): QueryConfig {
  const values: unknown[] = [];
  const parameter = (value: unknown, cast = "") => {
    values.push(value);
    return `$${values.length}${cast}`;
  };
  const conditions = [
    `a.batch_id = ANY(${parameter([...scope.sourceBatchIds], "::uuid[]")})`,
    `a.plant_id = ANY(${parameter([...scope.plantRecordIds], "::uuid[]")})`,
    `a.posting_date >= ${parameter(scope.from, "::date")}`,
    `a.posting_date <= ${parameter(scope.to, "::date")}`,
  ];
  for (const filter of scope.filters) conditions.push(filterCondition(filter, parameter));

  const contributingActuals = `WITH contributing_actuals AS (
    SELECT a.id, a.transaction_number, a.line_id, a.posting_date, a.reporting_month,
           a.plant_id, p.code AS plant_code, p.name AS plant_name,
           a.cost_center_id, c.code AS cost_center_code, c.name AS cost_center_name,
           a.gl_account_id, g.code AS gl_code, g.name AS gl_name,
           a.section, a.consideration, a.short_name, a.contra_account, a.origin, a.location,
           a.debit, a.credit, a.actual_amount, a.line_memo, a.reference_1,
           m.budget_component_key
      FROM agent_financial.financial_actual a
      JOIN agent_financial.plant p ON p.id = a.plant_id
      LEFT JOIN agent_financial.cost_center c ON c.id = a.cost_center_id AND c.plant_id = a.plant_id
      LEFT JOIN agent_financial.gl_account g ON g.id = a.gl_account_id
      LEFT JOIN agent_financial.actual_budget_mapping m
        ON m.mapping_version_id = ${parameter(scope.mappingVersionId, "::uuid")}
       AND m.plant_id = a.plant_id
       AND m.cost_center_id = a.cost_center_id
       AND m.gl_account_id = a.gl_account_id
     WHERE ${conditions.join("\n       AND ")}
  )`;
  if (kind === "summary") {
    return {
      text: `${contributingActuals}
        SELECT count(*)::text AS row_count,
               COALESCE(sum(actual_amount), 0)::numeric(18,2)::text AS actual_total
          FROM contributing_actuals`,
      values,
    };
  }
  return {
    text: `${contributingActuals}
      SELECT id, transaction_number, line_id, posting_date, reporting_month,
             plant_id, plant_code, plant_name, cost_center_id, cost_center_code,
             cost_center_name, gl_account_id, gl_code, gl_name, debit, credit,
             actual_amount, line_memo, reference_1
        FROM contributing_actuals
       ORDER BY posting_date, transaction_number, line_id, id`,
    values,
  };
}

function filterCondition(filter: ResolvedFilter, parameter: (value: unknown, cast?: string) => string): string {
  const expression = FILTER_EXPRESSIONS[filter.dimensionId];
  const hasUnmappedComponent =
    filter.dimensionId === "nursery_component" && filter.values.includes(UNMAPPED_COMPONENT_KEY);
  const concreteValues = filter.values.filter(
    (value): value is string => value !== null && value !== UNMAPPED_COMPONENT_KEY,
  );
  const includesNull = filter.values.includes(null) || hasUnmappedComponent;
  const matches: string[] = [];
  if (concreteValues.length) matches.push(`${expression} = ANY(${parameter(concreteValues, "::text[]")})`);
  if (includesNull) matches.push(`${expression} IS NULL`);
  const positive = matches.length ? `(${matches.join(" OR ")})` : "FALSE";
  return filter.operator === "neq"
    ? includesNull
      ? `NOT ${positive}`
      : `(${expression} IS NULL OR NOT ${positive})`
    : positive;
}

const FILTER_EXPRESSIONS: Record<FinancialDimensionId, string> = {
  plant: "p.code",
  month: "a.reporting_month::text",
  gl: "g.code",
  cost_center: "c.code",
  nursery_component: "m.budget_component_key",
  section: "a.section",
  consideration: "a.consideration",
  short_name: "a.short_name",
  contra_account: "a.contra_account",
  origin: "a.origin",
  location: "a.location",
};

function normalizeFilter(filter: SelectionFilter): ResolvedFilter {
  return {
    dimensionId: filter.dimensionId,
    operator: filter.operator,
    values: filter.operator === "in" ? [...filter.values] : [filter.value],
  };
}

async function resolveComponentDescendants(
  database: QueryHost,
  batchId: string,
  roots: string[],
): Promise<Map<string, string[]>> {
  if (!roots.length) return new Map();
  const result = await database.query<{ root_key: string; component_key: string }>(
    `WITH RECURSIVE descendants AS (
       SELECT c.id, c.component_key, c.component_key AS root_key
         FROM agent_financial.nursery_budget_component c
        WHERE c.batch_id = $1 AND c.component_key = ANY($2::text[])
       UNION ALL
       SELECT child.id, child.component_key, parent.root_key
         FROM descendants parent
         JOIN agent_financial.nursery_budget_component child
           ON child.batch_id = $1 AND child.parent_component_id = parent.id
     )
     SELECT root_key, component_key FROM descendants ORDER BY root_key, component_key`,
    [batchId, roots],
  );
  const descendants = new Map<string, string[]>();
  for (const { root_key, component_key } of result.rows) {
    descendants.set(root_key, [...(descendants.get(root_key) ?? []), component_key]);
  }
  return descendants;
}

function assertCellIdentity(grouping: FinancialDimensionId[], cellIdentity: CellIdentity): void {
  const grouped = new Set(grouping);
  if (Object.keys(cellIdentity).some((dimensionId) => !grouped.has(dimensionId as FinancialDimensionId))) {
    throw new Error("Financial cell identity must use selected grouping dimensions");
  }
}
