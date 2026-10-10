import { randomUUID } from "node:crypto";
import {
  financialQueryResultSchema,
  type FinancialDimensionId,
  type FinancialQueryResult,
  type FinancialSelection,
} from "@3f/contract";
import { Pool, type PoolClient } from "pg";
import { loadConfig } from "../config";
import { buildFinancialActualQuery, resolveFinancialScope, type ResolvedFinancialScope } from "./financial-predicate";

export const FINANCIAL_QUERY_REPOSITORY = "FINANCIAL_QUERY_REPOSITORY";
const UNMAPPED_COMPONENT = "unmapped-GL";
const MONEY_SCALE = 100n;
const PERCENTAGE_SCALE = 1_000_000n;

type QueryHost = Pick<Pool | PoolClient, "query">;
type Dimensions = Partial<Record<FinancialDimensionId, string | null>>;
type Coverage = FinancialQueryResult["coverage"][number];
type Values = FinancialQueryResult["totals"];
type CoverageEntry = { plantId: string; month: string; completeness: "confirmed" | "unconfirmed" };

interface GenerationRow {
  id: string;
  source_reporting_months: string[];
  actual_coverage: CoverageEntry[];
  budget_coverage: CoverageEntry[];
}

interface ActualFact {
  id: string;
  plant: string;
  month: string;
  gl: string | null;
  cost_center: string | null;
  nursery_component: string | null;
  section: string | null;
  consideration: string | null;
  short_name: string | null;
  contra_account: string | null;
  origin: string | null;
  location: string | null;
  amount: bigint;
}

interface BudgetFact {
  plant: string;
  month: string;
  gl: string | null;
  nursery_component: string;
  budget: bigint;
  rollover: bigint;
}

interface Aggregate {
  dimensions: Dimensions;
  actualFacts: ActualFact[];
  budgetFacts: BudgetFact[];
}

export class FinancialQueryRepository {
  private pool?: Pool;

  constructor(private readonly database?: QueryHost) {}

  async query(selection: FinancialSelection): Promise<FinancialQueryResult> {
    const database = this.database ?? this.getPool();
    const scope = await resolveFinancialScope(database, selection);
    const generation = await this.generation(database, scope.mappingVersionId);
    const actualFacts = await this.actualFacts(database, scope);
    const budgetFacts = await this.budgetFacts(database, scope);
    const ancestorKeys = await this.componentAncestors(database, scope.mappingVersionId);
    const coverage = buildCoverage(selection, scope, generation);
    const totals: Aggregate = { dimensions: {}, actualFacts, budgetFacts };
    const groups = aggregateGroups(selection.dimensionIds, actualFacts, budgetFacts, ancestorKeys);
    if (groups.length > 199) throw new Error("Financial query has more than 199 aggregate rows");
    const resultId = randomUUID();
    const rows = groups.map((group, index) => ({
      key: `row-${index + 1}`,
      dimensions: group.dimensions,
      values: resultValues(selection, group, coverage, `${resultId}-row-${index + 1}`),
    }));
    return financialQueryResultSchema.parse({
      resultId,
      selection,
      scope: { plantIds: [...scope.plantIds], from: scope.from, to: scope.to },
      rows,
      totals: resultValues(selection, totals, coverage, `${resultId}-total`),
      coverage,
    });
  }

  private async generation(database: QueryHost, batchId: string): Promise<GenerationRow> {
    const result = await database.query<GenerationRow>(
      `SELECT id, source_reporting_months::text[], actual_coverage, budget_coverage
         FROM agent_financial.ingestion_batch
        WHERE id = $1`,
      [batchId],
    );
    const generation = result.rows[0];
    if (!generation) throw new Error("Financial data is not loaded");
    return generation;
  }

  private async actualFacts(database: QueryHost, scope: ResolvedFinancialScope): Promise<ActualFact[]> {
    const details = await database.query<{ id: string }>(buildFinancialActualQuery(scope, "detail"));
    const ids = details.rows.map(({ id }) => id);
    if (!ids.length) return [];
    const result = await database.query<{
      id: string;
      plant: string;
      month: string;
      gl: string | null;
      cost_center: string | null;
      nursery_component: string | null;
      section: string | null;
      consideration: string | null;
      short_name: string | null;
      contra_account: string | null;
      origin: string | null;
      location: string | null;
      actual_amount: string;
    }>(
      `SELECT a.id, p.code AS plant, a.reporting_month::text AS month,
              g.code AS gl, c.code AS cost_center, m.budget_component_key AS nursery_component,
              a.section, a.consideration, a.short_name, a.contra_account, a.origin, a.location,
              a.actual_amount::numeric(18,2)::text
         FROM agent_financial.financial_actual a
         JOIN agent_financial.plant p ON p.id = a.plant_id
         LEFT JOIN agent_financial.cost_center c ON c.id = a.cost_center_id AND c.plant_id = a.plant_id
         LEFT JOIN agent_financial.gl_account g ON g.id = a.gl_account_id
         LEFT JOIN agent_financial.actual_budget_mapping m
           ON m.mapping_version_id = $2 AND m.plant_id = a.plant_id
          AND m.cost_center_id = a.cost_center_id AND m.gl_account_id = a.gl_account_id
        WHERE a.id = ANY($1::uuid[])
        ORDER BY a.id`,
      [ids, scope.mappingVersionId],
    );
    return result.rows.map(({ actual_amount, ...row }) => ({ ...row, amount: moneyToPaise(actual_amount) }));
  }

  private async budgetFacts(database: QueryHost, scope: ResolvedFinancialScope): Promise<BudgetFact[]> {
    const result = await database.query<{
      plant: string;
      month: string;
      gl: string | null;
      nursery_component: string;
      budget_amount: string;
      rollover_amount: string;
    }>(
      `SELECT p.code AS plant, n.reporting_month::text AS month, g.code AS gl,
              c.component_key AS nursery_component,
              n.budget_amount::numeric(18,2)::text, n.rollover_amount::numeric(18,2)::text
         FROM agent_financial.nursery_budget n
         JOIN agent_financial.plant p ON p.id = n.plant_id
         JOIN agent_financial.nursery_budget_component c
           ON c.batch_id = n.batch_id AND c.id = n.budget_component_id AND c.is_leaf
         LEFT JOIN agent_financial.gl_account g ON g.id = n.gl_account_id
        WHERE n.batch_id = ANY($1::uuid[])
          AND n.plant_id = ANY($2::uuid[])
          AND n.reporting_month >= $3::date
          AND n.reporting_month <= $4::date
        ORDER BY n.reporting_month, n.id`,
      [[...scope.sourceBatchIds], [...scope.plantRecordIds], scope.from, scope.to],
    );
    return result.rows
      .map(({ budget_amount, rollover_amount, ...row }) => ({
        ...row,
        budget: moneyToPaise(budget_amount),
        rollover: moneyToPaise(rollover_amount),
      }))
      .filter((fact) => scope.filters.every((filter) => budgetMatchesFilter(fact, filter)));
  }

  private async componentAncestors(database: QueryHost, batchId: string): Promise<Map<string, string[]>> {
    const result = await database.query<{ component_key: string; ancestor_key: string }>(
      `WITH RECURSIVE ancestry AS (
         SELECT c.id, c.parent_component_id, c.component_key, c.component_key AS ancestor_key
           FROM agent_financial.nursery_budget_component c WHERE c.batch_id = $1
         UNION ALL
         SELECT child.id, parent.parent_component_id, child.component_key, parent.component_key
           FROM ancestry child
           JOIN agent_financial.nursery_budget_component parent
             ON parent.batch_id = $1 AND parent.id = child.parent_component_id
       )
       SELECT component_key, ancestor_key FROM ancestry ORDER BY component_key, ancestor_key`,
      [batchId],
    );
    const ancestors = new Map<string, string[]>();
    for (const { component_key, ancestor_key } of result.rows) {
      ancestors.set(component_key, [...(ancestors.get(component_key) ?? []), ancestor_key]);
    }
    return ancestors;
  }

  private getPool(): Pool {
    if (this.pool) return this.pool;
    const config = loadConfig();
    const postgres = config.warehouse.postgres;
    if (!postgres.host || !postgres.database) throw new Error("Warehouse Postgres is not configured");
    this.pool = new Pool({
      ...postgres,
      max: 5,
      connectionTimeoutMillis: config.queryTimeoutMs,
      statement_timeout: config.queryTimeoutMs,
      query_timeout: config.queryTimeoutMs,
      allowExitOnIdle: true,
    });
    return this.pool;
  }
}

function buildCoverage(
  selection: FinancialSelection,
  scope: ResolvedFinancialScope,
  generation: GenerationRow,
): Coverage[] {
  const plantRecordId = new Map(scope.plantIds.map((plant, index) => [plant, scope.plantRecordIds[index]!]));
  const sourceMonths = new Set(generation.source_reporting_months);
  const actualCoverage = new Map(
    generation.actual_coverage.map(({ plantId, month, completeness }) => [`${plantId}\u0000${month}`, completeness]),
  );
  const budgetCoverage = new Set(
    generation.budget_coverage
      .filter(({ completeness }) => completeness === "confirmed")
      .map(({ plantId, month }) => `${plantId}\u0000${month}`),
  );
  return months(selection.timeWindow.from, selection.timeWindow.to).flatMap((month) =>
    selection.plantIds.map((plantId) => {
      const recordId = plantRecordId.get(plantId)!;
      const actual = actualCoverage.get(`${recordId}\u0000${month}`);
      return {
        plantId,
        month,
        actual: actual === "confirmed" ? "complete" : sourceMonths.has(month) ? "unconfirmed" : "not_loaded",
        budget: budgetCoverage.has(`${recordId}\u0000${month}`) ? "loaded" : "not_loaded",
      } satisfies Coverage;
    }),
  );
}

function aggregateGroups(
  grouping: FinancialDimensionId[],
  actualFacts: ActualFact[],
  budgetFacts: BudgetFact[],
  ancestorKeys: Map<string, string[]>,
): Aggregate[] {
  if (!grouping.length) return [];
  const groups = new Map<string, Aggregate>();
  const add = (dimensions: Dimensions, fact: ActualFact | BudgetFact, kind: "actual" | "budget") => {
    const key = JSON.stringify(grouping.map((dimension) => dimensions[dimension] ?? null));
    const group = groups.get(key) ?? { dimensions, actualFacts: [], budgetFacts: [] };
    if (kind === "actual") group.actualFacts.push(fact as ActualFact);
    else group.budgetFacts.push(fact as BudgetFact);
    groups.set(key, group);
  };
  for (const fact of actualFacts) {
    for (const dimensions of factCoordinates(grouping, fact, ancestorKeys)) add(dimensions, fact, "actual");
  }
  for (const fact of budgetFacts) {
    for (const dimensions of factCoordinates(grouping, fact, ancestorKeys)) add(dimensions, fact, "budget");
  }
  return [...groups.values()].sort((left, right) =>
    JSON.stringify(grouping.map((dimension) => left.dimensions[dimension] ?? "\uffff")).localeCompare(
      JSON.stringify(grouping.map((dimension) => right.dimensions[dimension] ?? "\uffff")),
    ),
  );
}

function factCoordinates(
  grouping: FinancialDimensionId[],
  fact: ActualFact | BudgetFact,
  ancestorKeys: Map<string, string[]>,
): Dimensions[] {
  const component = fact.nursery_component;
  const components = grouping.includes("nursery_component")
    ? component
      ? (ancestorKeys.get(component) ?? [component])
      : [UNMAPPED_COMPONENT]
    : [undefined];
  return components.map((componentKey) =>
    Object.fromEntries(
      grouping.map((dimension) => [
        dimension,
        dimension === "nursery_component" ? componentKey! : (fact[dimension as keyof typeof fact] as string | null),
      ]),
    ),
  );
}

function resultValues(
  selection: FinancialSelection,
  aggregate: Aggregate,
  allCoverage: Coverage[],
  drilldownId: string,
): Values {
  const coverage = relevantCoverage(allCoverage, aggregate.dimensions);
  const values: Values = {};
  const actualTotal = sum(aggregate.actualFacts.map(({ amount }) => amount));
  const budgetTotal = sum(aggregate.budgetFacts.map(({ budget }) => budget));
  const completeActual = coverage.length > 0 && coverage.every(({ actual }) => actual === "complete");
  const sourceCovered = coverage.some(({ actual }) => actual !== "not_loaded");
  const allBudgetLoaded = coverage.length > 0 && coverage.every(({ budget }) => budget === "loaded");
  const anyBudgetLoaded = coverage.some(({ budget }) => budget === "loaded");
  const unmapped = aggregate.dimensions.nursery_component === UNMAPPED_COMPONENT;
  const missingGlLine = aggregate.dimensions.gl != null && allBudgetLoaded && aggregate.budgetFacts.length === 0;
  const actualValue = completeActual
    ? ({ state: "available", value: paiseToMoney(actualTotal), label: "Actual", drilldownId } as const)
    : ({ state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null } as const);
  const budgetValue = unmapped
    ? ({ state: "unmapped", value: null, label: "No Budget assigned to Unmapped" } as const)
    : missingGlLine
      ? ({ state: "no_gl_line", value: null, label: "No Budget line for this GL" } as const)
      : allBudgetLoaded
        ? ({ state: "available", value: paiseToMoney(budgetTotal), label: "Budget" } as const)
        : ({ state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" } as const);

  if (selection.measureIds.includes("actual")) {
    values.actual = actualValue;
    if (!completeActual && sourceCovered) {
      values.availableActualSubtotal = {
        value: paiseToMoney(
          sum(
            aggregate.actualFacts
              .filter((fact) => coverageState(coverage, fact.plant, fact.month)?.actual !== "not_loaded")
              .map(({ amount }) => amount),
          ),
        ),
        label: "Available-data Actual subtotal — completeness unconfirmed",
        drilldownId,
      };
    }
  }
  if (selection.measureIds.includes("budget")) {
    values.budget = budgetValue;
    if (!unmapped && !allBudgetLoaded && anyBudgetLoaded) {
      values.availableBudgetSubtotal = {
        value: paiseToMoney(
          sum(
            aggregate.budgetFacts
              .filter((fact) => coverageState(coverage, fact.plant, fact.month)?.budget === "loaded")
              .map(({ budget }) => budget),
          ),
        ),
        label: "Available-only Budget subtotal — coverage incomplete",
      };
    }
  }
  if (selection.measureIds.includes("rollover")) {
    const closingMonth = coverage.reduce((latest, entry) => (entry.month > latest ? entry.month : latest), "");
    const closingCoverage = coverage.filter(({ month }) => month === closingMonth);
    const closingLoaded = closingCoverage.length > 0 && closingCoverage.every(({ budget }) => budget === "loaded");
    const closingFacts = aggregate.budgetFacts.filter(({ month }) => month === closingMonth);
    values.rollover = unmapped
      ? { state: "unmapped", value: null, label: "No Roll-over assigned to Unmapped" }
      : aggregate.dimensions.gl != null && closingLoaded && closingFacts.length === 0
        ? { state: "no_gl_line", value: null, label: "No Roll-over line for this GL" }
        : closingLoaded
          ? {
              state: "available",
              value: paiseToMoney(sum(closingFacts.map(({ rollover }) => rollover))),
              label: "Roll-over",
            }
          : { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" };
  }
  if (selection.measureIds.includes("percentage") || selection.comparisons?.includes("actual_vs_budget")) {
    values.percentage =
      actualValue.state === "available" && budgetValue.state === "available" && budgetTotal !== 0n
        ? { state: "available", value: percentage(actualTotal, budgetTotal), label: "Percentage" }
        : { state: "not_applicable", value: null, label: "Not applicable" };
  }
  return values;
}

function relevantCoverage(coverage: Coverage[], dimensions: Dimensions): Coverage[] {
  return coverage.filter(
    ({ plantId, month }) =>
      (dimensions.plant == null || dimensions.plant === plantId) &&
      (dimensions.month == null || dimensions.month === month),
  );
}

function coverageState(coverage: Coverage[], plant: string, month: string): Coverage | undefined {
  return coverage.find((entry) => entry.plantId === plant && entry.month === month);
}

function budgetMatchesFilter(fact: BudgetFact, filter: ResolvedFinancialScope["filters"][number]): boolean {
  const value = fact[filter.dimensionId as keyof BudgetFact] as string | null | undefined;
  const matches = filter.values.some((candidate) => candidate === value);
  return filter.operator === "neq" ? !matches : matches;
}

function months(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  while (cursor.toISOString().slice(0, 7) <= to.slice(0, 7)) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function moneyToPaise(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const paise = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -paise : paise;
}

function paiseToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / MONEY_SCALE}.${String(absolute % MONEY_SCALE).padStart(2, "0")}`;
}

function percentage(numerator: bigint, denominator: bigint): string {
  const scaled = divideRounded(numerator * 100n * PERCENTAGE_SCALE, denominator);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const fraction = String(absolute % PERCENTAGE_SCALE)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / PERCENTAGE_SCALE}${fraction ? `.${fraction}` : ""}`;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const rounded = absoluteNumerator % absoluteDenominator >= (absoluteDenominator + 1n) / 2n ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function sum(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}
