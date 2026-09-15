import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { AuthUser, MisStatementNode, MisStatementResolvedResponse } from "@3f/contract";
import { Workbook } from "exceljs";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { MisStatementExportService } from "../mis/mis-statement-export.service";
import { MisStatementService } from "../mis/mis-statement.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { DrillTransactionsRepository } from "./drill-transactions.repository";
import { createWarehouseWritePool } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { StatementOutlineRepository } from "./statement-outline.repository";
import { migrateWarehouse } from "./warehouse-migrate";

const ENABLED = process.env.WAREHOUSE_DB_TEST === "1";
const JULY = "2026-07-01";
const ACTUALS = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");
const BUDGET = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/Nursery MIS Format.xlsx");
const DUB_BASELINE = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/dub-statement-baseline.json"), "utf8"),
) as DubStatementBaseline;
let pool: Awaited<ReturnType<typeof createWarehouseWritePool>>;
let statements: MisStatementService;
let resolver: SelectionResolverService;

test("the destructive all plants reconciliation proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

before(async () => {
  if (!ENABLED) return;
  assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
  await migrateWarehouse();
  pool = await createWarehouseWritePool();
  await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
  const ingest = new IngestService();
  await ingest.ingestActuals(upload(ACTUALS), "all-plants-proof");
  await ingest.ingestBudget(upload(BUDGET), "all-plants-proof");
  const warehouse = new PostgresAdapter();
  resolver = new SelectionResolverService(warehouse);
  statements = new MisStatementService(
    resolver,
    new SemanticLayer(),
    new SelectionExecutor(new SqlBuilder(), new SqlValidator(), warehouse),
    new StatementOutlineRepository(warehouse),
  );
});

after(async () => pool?.end());

test(
  "WAREHOUSE_DB_TEST renders all thirty one plant statements and their grand totals sum to the company net in exact paise",
  { skip: !ENABLED },
  async () => {
    const user = userFor(MAPPING_MASTER.selections.map(({ plant_canonical }) => plant_canonical));
    const options = await resolver.options(user.scope.map(({ value }) => value));
    assert.equal(options.plants.length, 31);
    let companyActual = 0n;
    for (const selection of MAPPING_MASTER.selections) {
      const response = await statements.run(user, request(selection));
      assert.equal(response.outcome, "resolved", selection.plant_canonical);
      if (response.outcome !== "resolved") continue;
      companyActual += paise(response.grandTotal.measures[0].actual);
    }
    assert.equal(companyActual, 11_027_371_800n);
  },
);

test(
  "WAREHOUSE_DB_TEST keeps the DUB statement values tree provenance and export identical to the shipped output",
  { skip: !ENABLED },
  async () => {
    const selection = MAPPING_MASTER.selections.find(({ plant_canonical }) => plant_canonical === "DUB")!;
    const user = userFor(["DUB"]);
    const canonical = await statements.run(user, request(selection));
    const alias = await statements.run(user, { ...request(selection), plant: "DUB-NUR" });
    assert.equal(canonical.outcome, "resolved");
    assert.equal(alias.outcome, "resolved");
    if (canonical.outcome !== "resolved" || alias.outcome !== "resolved") return;
    assert.equal(canonical.grandTotal.measures[0].actual, "11512712.07");
    assert.equal(canonical.grandTotal.measures[0].budget, "10050136.29");
    assert.ok(allBlocks(canonical).every(({ budgetState }) => budgetState === "loaded"));
    assert.equal(DUB_BASELINE.sourceCommit, "d532693");
    assert.deepEqual(toBaseline(canonical), {
      plant: DUB_BASELINE.plant,
      period: DUB_BASELINE.period,
      provenance: DUB_BASELINE.provenance,
      tree: DUB_BASELINE.tree,
      grandTotal: DUB_BASELINE.grandTotal,
    });
    assert.deepEqual(alias, canonical);
    const exporter = new MisStatementExportService();
    const canonicalExport = await exporter.write(canonical);
    assert.deepEqual(await exporter.write(alias), canonicalExport);
    const workbook = new Workbook();
    await workbook.xlsx.load(canonicalExport as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const worksheet = workbook.getWorksheet("Financial MIS")!;
    const baselineRows = [...flattenBaseline(DUB_BASELINE.tree), DUB_BASELINE.grandTotal];
    assert.equal(worksheet.rowCount, baselineRows.length + 2);
    baselineRows.forEach(({ measures }, index) => {
      const row = worksheet.getRow(index + 3);
      assert.deepEqual(
        measures.flatMap(({ budget, rollover, actual, percentage }) => [
          roundedRupees(budget),
          rollover,
          roundedRupees(actual),
          percentage === null ? "NA" : Number.isFinite(Number(percentage)) ? Number(percentage) : percentage,
        ]),
        Array.from({ length: measures.length * 4 }, (_, column) => row.getCell(column + 4).value),
      );
    });
  },
);

test(
  "WAREHOUSE_DB_TEST foots a non owner leaf and unmapped GL drill for a user granted that plant alone",
  { skip: !ENABLED },
  async () => {
    const selection = MAPPING_MASTER.selections.find(({ plant_canonical }) => plant_canonical === "CHIR")!;
    const user = userFor(["CHIR"]);
    const statement = await statements.run(user, request(selection));
    const resolution = await resolver.resolve(request(selection));
    assert.equal(statement.outcome, "resolved");
    assert.equal(resolution.outcome, "resolved");
    if (statement.outcome !== "resolved" || resolution.outcome !== "resolved") return;
    const actualBatchIds = statement.provenance.activeBatchIds
      .filter(({ source }) => source === "actuals")
      .map(({ batchId }) => batchId);
    const repository = new DrillTransactionsRepository(new SqlValidator(), new PostgresAdapter());
    const mappedLeaf = (resolution.leafTargets ?? []).find(({ target }) => target.kind === "leaf")?.target;
    assert.ok(mappedLeaf?.kind === "leaf");
    for (const leafKey of [mappedLeaf.leafKey, "unmapped-GL"]) {
      const nodeKey = leafKey === "unmapped-GL" ? leafKey : `leaf:${leafKey}`;
      const statementNode: MisStatementNode | undefined = flatten(statement.tree).find(
        (node) => node.nodeKey === nodeKey,
      );
      assert.ok(statementNode, leafKey);
      const triples = (resolution.leafTargets ?? [])
        .filter(
          ({ target }) =>
            target.kind === (leafKey === "unmapped-GL" ? "bucket" : "leaf") &&
            (target.kind !== "leaf" || target.leafKey === leafKey),
        )
        .map(({ plant, costCenter, glCode }) => ({ plant, costCenter, glCode }));
      assert.ok(triples.length);
      const drill = await repository.execute(
        repository.buildQueries({ actualBatchIds, triples, plants: ["CHIR"], from: JULY, to: JULY }, 1),
      );
      assert.equal(drill.footer.value, statementNode.measures[0].actual);
    }
  },
);

function request(selection: (typeof MAPPING_MASTER.selections)[number]) {
  return {
    department: selection.department,
    function: selection.function,
    plant: selection.plant_canonical,
    period: JULY,
  };
}

function userFor(plants: string[]): AuthUser {
  return {
    id: "all-plants-proof",
    email: "proof@example.test",
    display_name: "Proof",
    is_active: true,
    roles: ["admin"],
    permissions: {
      actions: ["report"],
      domains: ["mis-statement"],
      measureIds: [
        "mis-statement.actual_net",
        "mis-statement.budget_net",
        "mis-statement.rollover_net",
        "mis-statement.percentage",
      ],
      dimensionIds: ["leaf_key"],
    },
    scope: plants.map((value) => ({ attribute: "plant", value })),
  };
}

function upload(path: string): UploadedWorkbook {
  const buffer = readFileSync(path);
  return {
    originalname: path.endsWith("Nursery MIS Format.xlsx") ? "Nursery MIS Format.xlsx" : "SAP Entries Mapping.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
}

function flatten(nodes: MisStatementNode[]): MisStatementNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function allBlocks(statement: MisStatementResolvedResponse) {
  return [...flatten(statement.tree).flatMap(({ measures }) => measures), ...statement.grandTotal.measures];
}

interface BaselineMeasure {
  key: string;
  budget: string;
  rollover: null;
  actual: string;
  percentage: string | null;
  sourcePresence: string[];
}

interface BaselineNode {
  nodeKey: string;
  measures: BaselineMeasure[];
  children?: BaselineNode[];
}

interface DubStatementBaseline {
  sourceCommit: string;
  plant: string;
  period: string;
  provenance: Array<{ source: string; period: string }>;
  tree: BaselineNode[];
  grandTotal: BaselineNode;
}

function toBaseline(statement: MisStatementResolvedResponse) {
  const node = ({ nodeKey, measures, children }: MisStatementNode): BaselineNode => ({
    nodeKey,
    measures: measures.map((measure) => {
      if (measure.budgetState !== "loaded") throw new Error("DUB baseline requires a loaded budget");
      const { key, budget, rollover, actual, percentage, sourcePresence } = measure;
      return { key, budget, rollover, actual, percentage, sourcePresence };
    }),
    ...(children.length ? { children: children.map(node) } : { children: [] }),
  });
  const { children: _children, ...grandTotal } = node(statement.grandTotal);
  return {
    plant: statement.scope.plant,
    period: statement.scope.period,
    provenance: [
      ...new Map(
        statement.provenance.activeBatchIds.map(({ source, period }) => [`${source}\0${period}`, { source, period }]),
      ).values(),
    ].sort((left, right) => `${left.source}\0${left.period}`.localeCompare(`${right.source}\0${right.period}`)),
    tree: statement.tree.map(node),
    grandTotal,
  };
}

function flattenBaseline(nodes: BaselineNode[]): BaselineNode[] {
  return nodes.flatMap((node) => [node, ...flattenBaseline(node.children ?? [])]);
}

function roundedRupees(value: string): number {
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  const rounded = BigInt(whole) + (Number(fraction) >= 50 ? 1n : 0n);
  return Number(negative ? -rounded : rounded);
}

function paise(value: string): bigint {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive all plants setup",
  );
}
