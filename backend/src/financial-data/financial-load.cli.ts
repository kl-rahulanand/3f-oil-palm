import { Pool } from "pg";
import { loadWarehousePostgresConfig } from "../config";
import { MAPPING_MASTER, selectionAliases } from "../mapping/mapping-master";
import { FinancialLoadRepository } from "./financial-load.repository";
import {
  loadFinancialWorkbook,
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
    const repository = new FinancialLoadRepository(pool);
    const report = await loadFinancialWorkbook(options, {
      prepareReferences: (source) => prepareFinancialLoadReferences(pool, options.importingActor, source),
      activateGeneration: (input) => repository.activateGeneration(input),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

async function prepareFinancialLoadReferences(
  pool: Pool,
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO agent_financial.plant (code, name, source_aliases, created_by_actor)
       SELECT code, name, source_aliases, $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(code text, name text, source_aliases text[])
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, source_aliases = EXCLUDED.source_aliases`,
      [JSON.stringify(plants), actor],
    );
    await client.query(
      `INSERT INTO agent_financial.cost_center
         (plant_id, source_system, code, name, source_aliases, created_by_actor)
       SELECT plant.id, 'SAP', seed.code, seed.name, ARRAY[]::text[], $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(plant_code text, code text, name text)
         JOIN agent_financial.plant plant ON plant.code = seed.plant_code
       ON CONFLICT (source_system, plant_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [JSON.stringify(costCenters), actor],
    );
    await client.query(
      `INSERT INTO agent_financial.gl_account
         (source_system, code, name, source_aliases, created_by_actor)
       SELECT 'SAP', code, name, ARRAY[]::text[], $2
         FROM jsonb_to_recordset($1::jsonb) AS seed(code text, name text)
       ON CONFLICT (source_system, code) DO UPDATE SET name = EXCLUDED.name`,
      [JSON.stringify(glAccounts), actor],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return readFinancialLoadReferences(pool);
}

function normalizeReference(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function readFinancialLoadReferences(pool: Pool): Promise<FinancialLoadReferences> {
  const [plants, costCenters, glAccounts] = await Promise.all([
    pool.query<{ id: string; code: string; source_aliases: string[] }>(
      "SELECT id, code, source_aliases FROM agent_financial.plant",
    ),
    pool.query<{ id: string; plant_id: string; code: string; source_aliases: string[] }>(
      "SELECT id, plant_id, code, source_aliases FROM agent_financial.cost_center WHERE source_system = $1",
      ["SAP"],
    ),
    pool.query<{ id: string; code: string; source_aliases: string[] }>(
      "SELECT id, code, source_aliases FROM agent_financial.gl_account WHERE source_system = $1",
      ["SAP"],
    ),
  ]);
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

if (require.main === module) {
  runFinancialLoadCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Financial workbook load failed"}\n`);
    process.exitCode = 1;
  });
}
