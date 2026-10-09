import { Pool, type PoolClient, type QueryConfig, type QueryResult } from "pg";
import { loadWarehousePostgresConfig } from "../config";
import { MAPPING_MASTER, selectionAliases } from "../mapping/mapping-master";
import { FinancialLoadRepository } from "./financial-load.repository";
import {
  loadFinancialWorkbook,
  type FinancialLoadReport,
  type FinancialLoadOptions,
  type FinancialLoadReferences,
  type FinancialReferenceSource,
} from "./financial-loader";

export function parseFinancialLoadArguments(arguments_: string[]): FinancialLoadOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Financial load arguments must be named value pairs");
    }
    if (!["--file", "--budget-owner", "--actor"].includes(name) || values.has(name)) {
      throw new Error("Financial load argument is unknown or repeated");
    }
    values.set(name, value);
  }
  const filePath = values.get("--file")?.trim();
  const budgetOwner = values.get("--budget-owner")?.trim();
  const importingActor = values.get("--actor")?.trim();
  if (!filePath || budgetOwner !== "DUB" || !importingActor || values.size !== 3) {
    throw new Error("Usage: financial:load -- --file <xlsx> --budget-owner DUB --actor <operator>");
  }
  return { filePath, budgetOwner, importingActor };
}

export async function runFinancialLoadCli(arguments_: string[]): Promise<void> {
  const options = parseFinancialLoadArguments(arguments_);
  const pool = new Pool({ ...(await loadWarehousePostgresConfig()), max: 4 });
  try {
    const report = await loadFinancialWorkbookIntoPool(options, pool);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

export async function loadFinancialWorkbookIntoPool(
  options: FinancialLoadOptions,
  pool: Pool,
): Promise<FinancialLoadReport> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('agent_financial_generation'), hashtext('financial-chat-workbook'))",
    );
    const repository = new FinancialLoadRepository(repositorySavepointClient(client));
    const report = await loadFinancialWorkbook(options, {
      prepareReferences: (source) => prepareFinancialLoadReferences(client, options.importingActor, source),
      activateGeneration: async (input) => {
        const result = await repository.activateGeneration(input);
        await verifyPersistedGeneration(client, result.batchId, input);
        return result;
      },
    });
    await client.query("COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function prepareFinancialLoadReferences(
  client: PoolClient,
  actor: string,
  source: FinancialReferenceSource,
): Promise<FinancialLoadReferences> {
  const plants = MAPPING_MASTER.selections.map((selection) => ({
    code: selection.plant_canonical,
    name: selection.plant_aliases.display[0] ?? selection.plant_canonical,
    source_aliases: selectionAliases(selection).filter((alias) => alias !== selection.plant_canonical),
  }));
  const canonicalPlants = new Map(
    MAPPING_MASTER.selections.flatMap((selection) =>
      selectionAliases(selection).map((alias) => [normalizeReference(alias), selection.plant_canonical]),
    ),
  );
  const costCenters = [
    ...new Map([
      ...MAPPING_MASTER.selections.flatMap((selection) =>
        selection.entries.map(
          (entry) =>
            [
              `${selection.plant_canonical}\0${entry.cost_center}`,
              { plant_code: selection.plant_canonical, code: entry.cost_center, name: entry.cost_center },
            ] as const,
        ),
      ),
      ...source.costCenters.flatMap(({ plantCode, code }) => {
        const canonical = canonicalPlants.get(normalizeReference(plantCode));
        return canonical ? ([[`${canonical}\0${code}`, { plant_code: canonical, code, name: code }]] as const) : [];
      }),
    ]).values(),
  ];
  const glAccounts = [
    ...new Map([
      ...MAPPING_MASTER.selections.flatMap((selection) =>
        selection.entries.map((entry) => [entry.gl_code, { code: entry.gl_code, name: entry.gl_code }] as const),
      ),
      ...source.glAccounts.map(({ code, name }) => [code, { code, name }] as const),
    ]).values(),
  ];
  await client.query(
    `INSERT INTO agent_financial.plant (code, name, source_aliases, created_by_actor)
       SELECT code, name, source_aliases, $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(code text, name text, source_aliases text[])
        WHERE NOT EXISTS (SELECT 1 FROM agent_financial.plant plant WHERE plant.code = seed.code)`,
    [JSON.stringify(plants), actor],
  );
  await client.query(
    `INSERT INTO agent_financial.cost_center
         (plant_id, source_system, code, name, source_aliases, created_by_actor)
       SELECT plant.id, 'SAP', seed.code, seed.name, ARRAY[]::text[], $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(plant_code text, code text, name text)
         JOIN agent_financial.plant plant ON plant.code = seed.plant_code
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_financial.cost_center cost_center
           WHERE cost_center.source_system = 'SAP' AND cost_center.plant_id = plant.id
             AND cost_center.code = seed.code
        )`,
    [JSON.stringify(costCenters), actor],
  );
  await client.query(
    `INSERT INTO agent_financial.gl_account
         (source_system, code, name, source_aliases, created_by_actor)
       SELECT 'SAP', code, name, ARRAY[]::text[], $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(code text, name text)
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_financial.gl_account gl_account
           WHERE gl_account.source_system = 'SAP' AND gl_account.code = seed.code
        )`,
    [JSON.stringify(glAccounts), actor],
  );
  return readFinancialLoadReferences(client);
}

function normalizeReference(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function readFinancialLoadReferences(client: PoolClient): Promise<FinancialLoadReferences> {
  const plants = await client.query<{ id: string; code: string; source_aliases: string[] }>(
    "SELECT id, code, source_aliases FROM agent_financial.plant",
  );
  const costCenters = await client.query<{ id: string; plant_id: string; code: string; source_aliases: string[] }>(
    "SELECT id, plant_id, code, source_aliases FROM agent_financial.cost_center WHERE source_system = $1",
    ["SAP"],
  );
  const glAccounts = await client.query<{ id: string; code: string; source_aliases: string[] }>(
    "SELECT id, code, source_aliases FROM agent_financial.gl_account WHERE source_system = $1",
    ["SAP"],
  );
  return {
    plants: plants.rows.map(({ id, code, source_aliases }) => ({ id, code, sourceAliases: source_aliases })),
    costCenters: costCenters.rows.map(({ id, plant_id, code, source_aliases }) => ({
      id,
      plantId: plant_id,
      code,
      sourceAliases: source_aliases,
    })),
    glAccounts: glAccounts.rows.map(({ id, code, source_aliases }) => ({ id, code, sourceAliases: source_aliases })),
  };
}

function repositorySavepointClient(client: PoolClient): Pool {
  const query = async (config: string | QueryConfig, values?: unknown[]): Promise<QueryResult> => {
    const command = (typeof config === "string" ? config : config.text).trim().toLowerCase();
    if (command.startsWith("begin")) return client.query("SAVEPOINT financial_generation_activation");
    if (command === "commit") return client.query("RELEASE SAVEPOINT financial_generation_activation");
    if (command === "rollback") {
      await client.query("ROLLBACK TO SAVEPOINT financial_generation_activation");
      return client.query("RELEASE SAVEPOINT financial_generation_activation");
    }
    return typeof config === "string" ? client.query(config, values) : client.query(config, values);
  };
  return { query } as unknown as Pool;
}

async function verifyPersistedGeneration(
  client: PoolClient,
  batchId: string,
  input: Parameters<FinancialLoadRepository["activateGeneration"]>[0],
): Promise<void> {
  const batch = await client.query<{
    source_reporting_months: string[];
    actual_coverage: unknown;
    budget_coverage: unknown;
    source_counts: unknown;
    reconciliation_result: unknown;
    actual_count: number;
    budget_count: number;
    component_count: number;
    mapping_count: number;
  }>(
    `SELECT source_reporting_months::text[] AS source_reporting_months,
            actual_coverage, budget_coverage, source_counts, reconciliation_result,
            (SELECT count(*)::int FROM agent_financial.financial_actual WHERE batch_id = $1) AS actual_count,
            (SELECT count(*)::int FROM agent_financial.nursery_budget WHERE batch_id = $1) AS budget_count,
            (SELECT count(*)::int FROM agent_financial.nursery_budget_component WHERE batch_id = $1) AS component_count,
            (SELECT count(*)::int FROM agent_financial.actual_budget_mapping WHERE mapping_version_id = $1) AS mapping_count
       FROM agent_financial.ingestion_batch WHERE id = $1`,
    [batchId],
  );
  const row = batch.rows[0];
  const expectedCounts = {
    actual: input.actuals.length,
    budget: input.budgets.length,
    components: input.components.length,
    mappings: input.mappings.length,
  };
  if (!row) throw new Error("Persisted financial generation is missing");
  if (
    !sameJson(row.source_reporting_months, input.metadata.sourceReportingMonths) ||
    !sameJson(row.actual_coverage, input.metadata.actualCoverage) ||
    !sameJson(row.budget_coverage, input.metadata.budgetCoverage)
  ) {
    throw new Error("Persisted financial generation coverage does not reconcile to the source");
  }
  if (
    !sameJson(row.source_counts, expectedCounts) ||
    row.actual_count !== expectedCounts.actual ||
    row.budget_count !== expectedCounts.budget ||
    row.component_count !== expectedCounts.components ||
    row.mapping_count !== expectedCounts.mappings
  ) {
    throw new Error("Persisted financial generation counts do not reconcile to the source");
  }
  if (!sameJson(row.reconciliation_result, input.metadata.reconciliationResult))
    throw new Error("Persisted financial generation evidence does not reconcile to the source");

  const actuals = await client.query<{
    month: string;
    rowCount: number;
    debit: string;
    credit: string;
    actual: string;
  }>(
    `SELECT reporting_month::text AS month, count(*)::int AS "rowCount",
              sum(debit)::text AS debit, sum(credit)::text AS credit, sum(actual_amount)::text AS actual
         FROM agent_financial.financial_actual WHERE batch_id = $1
        GROUP BY reporting_month ORDER BY reporting_month`,
    [batchId],
  );
  const budgets = await client.query<{ month: string; rowCount: number; budget: string; rollover: string }>(
    `SELECT reporting_month::text AS month, count(*)::int AS "rowCount",
              sum(budget_amount)::text AS budget, sum(rollover_amount)::text AS rollover
         FROM agent_financial.nursery_budget WHERE batch_id = $1
        GROUP BY reporting_month ORDER BY reporting_month`,
    [batchId],
  );
  const reconciliation = input.metadata.reconciliationResult;
  const expectedActuals = financialMonthEvidence(reconciliation, "actualByMonth", [
    "rowCount",
    "debit",
    "credit",
    "actual",
  ]);
  const expectedBudgets = financialMonthEvidence(reconciliation, "budgetByMonth", ["rowCount", "budget", "rollover"]);
  if (!sameJson(indexMonths(actuals.rows), expectedActuals) || !sameJson(indexMonths(budgets.rows), expectedBudgets)) {
    throw new Error("Persisted financial generation amounts do not reconcile to the source");
  }
}

function financialMonthEvidence(
  reconciliation: Record<string, unknown>,
  key: string,
  fields: string[],
): Record<string, unknown> {
  const evidence = reconciliation[key];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Financial source reconciliation evidence is missing");
  }
  return Object.fromEntries(
    Object.entries(evidence).map(([month, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Financial source reconciliation evidence is invalid");
      }
      const record = value as Record<string, unknown>;
      return [month, Object.fromEntries(fields.map((field) => [field, record[field]]))];
    }),
  );
}

function indexMonths(rows: Array<{ month: string }>): Record<string, unknown> {
  return Object.fromEntries(rows.map(({ month, ...values }) => [month, values]));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  }
  return value;
}

if (require.main === module) {
  runFinancialLoadCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Financial workbook load failed"}\n`);
    process.exitCode = 1;
  });
}
