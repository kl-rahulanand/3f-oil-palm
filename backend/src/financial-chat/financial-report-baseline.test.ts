import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ResponseClass,
  type AskDrillResponse,
  type AskResponse,
  type AuthUser,
  type MisStatementNode,
  type Selection,
} from "@3f/contract";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Workbook } from "exceljs";
import type { Pool } from "pg";
import { AuthGuard } from "../auth/auth.guard";
import { AUTH_COOKIE_NAMES } from "../auth/cookies";
import { ChatController } from "../chat/chat.controller";
import { AskDrillController } from "../chat/ask-drill.controller";
import { AskDrillContextService, type AskDrillContextClaims } from "../chat/ask-drill-context";
import { AskDrillService } from "../chat/ask-drill.service";
import { ChatService } from "../chat/chat.service";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { StatementExplanationService } from "../chat/statement-explanation.service";
import { StatementGroundingService } from "../chat/statement-grounding.service";
import { LLM_PROVIDER } from "../config";
import { AuditService } from "../core/audit.service";
import { DimensionValuesService } from "../core/dimension-values.service";
import { RbacService } from "../core/rbac.service";
import { SessionService } from "../core/session.service";
import { createDb, createPool } from "../db/pool";
import { auditEvents, rolePerms, roles, userRoles, userScope, users } from "../db/schema";
import { HelpService } from "../help/help.service";
import { IngestService } from "../ingest/ingest.service";
import type { LlmProvider } from "../llm/llm.interface";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { MisStatementExportService } from "../mis/mis-statement-export.service";
import { MisStatementService } from "../mis/mis-statement.service";
import { MisDrillService } from "../mis/mis-drill.service";
import { StatementAttestationService } from "../mis/statement-attestation";
import { ReportsService } from "../reports/reports.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import { GlNameRepository } from "../warehouse/gl-name.repository";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { PostgresAdapter } from "../warehouse/postgres.adapter";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import {
  assertDisposableFinancialDatabases,
  assertTrustedFinancialBaselineDirectory,
  type FinancialDatabaseTargets,
} from "./financial-disposable-db.guard";
import {
  prepareLegacyFinancialSource,
  snapshotFinancialWorkbook,
  writeFinancialBaselineArtifact,
} from "./financial-report-baseline";
import { inspectFinancialSource } from "./financial-source-oracle";

test("the generated source oracle independently preserves source rows, signs, columns, and monthly sums", async () => {
  const directory = await mkdtemp(join(tmpdir(), "3f-financial-source-oracle-"));
  const path = join(directory, "Generated Financial Source (baseline).xlsx");
  try {
    const workbook = new Workbook();
    const actual = workbook.addWorksheet("Actual");
    actual.addRow([
      "Section",
      "Transaction Number",
      "Line_Id",
      "Posting Date",
      "Month",
      "Plant",
      "Cost Center",
      "MIS GL Code",
      "MIS GL Name",
      "Debit",
      "Credit",
      "Comments",
      "Comments",
      "ContraAct",
      "Origin",
    ]);
    actual.addRow([
      "Nursery",
      "T-1",
      "1",
      "2026-04-05",
      "apr",
      "DUB-NUR",
      "CC-1",
      "4100",
      "Seed",
      "100.125",
      "5.12",
      "left",
      "right",
      "",
      "SAP",
    ]);
    actual.addRow([
      "Nursery",
      "T-2",
      "1",
      "2026-04-06",
      "apr",
      "",
      "",
      "",
      "Freight",
      "-2.005",
      "10.005",
      "",
      "kept",
      "",
      "",
    ]);
    actual.addRow([
      "Nursery",
      "T-3",
      "1",
      "2026-05-01",
      "may",
      "DUB-NUR",
      "CC-1",
      "4100",
      "Seed",
      "20",
      "0",
      "",
      "",
      "",
      "Manual",
    ]);

    const budget = workbook.addWorksheet("Nursery Financial MIS");
    budget.getCell("A1").value = { formula: 'TEXT(A2,"mmm")', result: "#VALUE!" };
    budget.getCell("A1").numFmt = "mmm-yy";
    budget.addRow(["S. No.", "Budget Components", "GL Codes", "Apr-26", "Apr-26", "May-26", "May-26"]);
    budget.addRow(["", "", "", "Budget", "Roll Over Budget", "Budget", "Roll Over Budget"]);
    budget.addRow([
      "1",
      "Nursery total",
      "TOTAL",
      { formula: "SUM(D5:D6)", result: 90.005 },
      { formula: "SUM(E5:E6)", result: 4.004 },
      { formula: "SUM(F5:F6)", result: 90 },
      { formula: "SUM(G5:G6)", result: 5 },
    ]);
    budget.addRow([
      "1",
      "Seed",
      "4100",
      { formula: "D6+70.005", result: 80.005 },
      { formula: "4.004", result: 4.004, ref: "E5:E6", shareType: "shared" },
      "90",
      "5",
    ]);
    budget.addRow(["2", "Freight", "", "10", { sharedFormula: "E5", result: 0.001 }, "", ""]);
    budget.getRow(4).outlineLevel = 0;
    budget.getRow(5).outlineLevel = 1;
    budget.getRow(6).outlineLevel = 1;

    await writeFile(path, Buffer.from(await workbook.xlsx.writeBuffer()));
    const source = await inspectFinancialSource(path);
    const bytes = await readFile(path);
    const legacy = await prepareLegacyFinancialSource(path);
    const prepared = new Workbook();
    await prepared.xlsx.load(legacy.actuals[0]!.upload.buffer as unknown as Parameters<typeof prepared.xlsx.load>[0]);
    const preparedBudget = new Workbook();
    await preparedBudget.xlsx.load(legacy.budget.buffer as unknown as Parameters<typeof preparedBudget.xlsx.load>[0]);

    assert.equal(source.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(prepared.getWorksheet("Actual")!.getCell("I1").value, "AcctName");
    assert.equal(prepared.getWorksheet("Actual")!.getCell("F2").value, "DUB-NUR");
    assert.deepEqual(legacy.actualSourcePlants, ["DUB-NUR"]);
    assert.deepEqual(
      preparedBudget.worksheets.map(({ name }) => name),
      ["Nursery Financial MIS"],
    );
    assert.deepEqual(source.actual, {
      columns: [
        "Section",
        "Transaction Number",
        "Line_Id",
        "Posting Date",
        "Month",
        "Plant",
        "Cost Center",
        "MIS GL Code",
        "MIS GL Name",
        "Debit",
        "Credit",
        "Comments",
        "Comments_2",
        "ContraAct",
        "Origin",
      ],
      rows: [
        {
          sourceRow: 2,
          transactionNumber: "T-1",
          lineId: "1",
          postingDate: "2026-04-05",
          plant: "DUB-NUR",
          costCenter: "CC-1",
          glCode: "4100",
          debit: "100.125",
          credit: "5.12",
          section: "Nursery",
          origin: "SAP",
          comments: "left",
          comments2: "right",
        },
        {
          sourceRow: 3,
          transactionNumber: "T-2",
          lineId: "1",
          postingDate: "2026-04-06",
          plant: null,
          costCenter: null,
          glCode: null,
          debit: "-2.005",
          credit: "10.005",
          section: "Nursery",
          origin: null,
          comments: null,
          comments2: "kept",
        },
        {
          sourceRow: 4,
          transactionNumber: "T-3",
          lineId: "1",
          postingDate: "2026-05-01",
          plant: "DUB-NUR",
          costCenter: "CC-1",
          glCode: "4100",
          debit: "20",
          credit: "0",
          section: "Nursery",
          origin: "Manual",
          comments: null,
          comments2: null,
        },
      ],
      rowCount: 3,
      debit: "118.12",
      credit: "15.13",
      actual: "102.99",
      reportingMonths: ["2026-04-01", "2026-05-01"],
      byPlantMonth: [
        { plant: null, reportingMonth: "2026-04-01", rowCount: 1, actual: "-12.02" },
        { plant: "DUB", reportingMonth: "2026-04-01", rowCount: 1, actual: "95.01" },
        { plant: "DUB", reportingMonth: "2026-05-01", rowCount: 1, actual: "20.00" },
      ],
      legacyCompatible: {
        rowCount: 2,
        excludedRowCount: 1,
        byPlantMonth: [
          { plant: "DUB", reportingMonth: "2026-04-01", rowCount: 1, actual: "95.01" },
          { plant: "DUB", reportingMonth: "2026-05-01", rowCount: 1, actual: "20.00" },
        ],
      },
    });
    assert.deepEqual(source.budget, {
      rowCount: 2,
      leaves: [
        {
          sourceRow: 5,
          component: "Seed",
          glCode: "4100",
          periods: [
            { reportingMonth: "2026-04-01", budget: "80.005", rollover: "4.004" },
            { reportingMonth: "2026-05-01", budget: "90", rollover: "5" },
          ],
        },
        {
          sourceRow: 6,
          component: "Freight",
          glCode: null,
          periods: [
            { reportingMonth: "2026-04-01", budget: "10", rollover: "0.001" },
            { reportingMonth: "2026-05-01", budget: null, rollover: null },
          ],
        },
      ],
      periods: [
        { reportingMonth: "2026-04-01", leafCount: 2, budget: "90.01", rollover: "4.00" },
        { reportingMonth: "2026-05-01", leafCount: 2, budget: "90.00", rollover: "5.00" },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the source oracle rejects an invalid Actual posting date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "3f-financial-source-invalid-date-"));
  const path = join(directory, "invalid-date.xlsx");
  try {
    await writeMinimalOracle(path, { formula: 'TEXT(A1,"yyyy-mm-dd")', result: "#VALUE!" }, "1.00");
    await assert.rejects(inspectFinancialSource(path), /Actual source row 2 has an invalid Posting Date/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the source oracle rejects a missing Actual debit and credit instead of treating the row as zero", async () => {
  const directory = await mkdtemp(join(tmpdir(), "3f-financial-source-missing-amount-"));
  const path = join(directory, "missing-amount.xlsx");
  try {
    await writeMinimalOracle(path, "2026-04-05", null, null);
    await assert.rejects(inspectFinancialSource(path), /Actual row 2 Debit and Credit are missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the baseline writer accepts an exact replay and rejects changed outputs for a checksummed source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "3f-financial-baseline-retention-"));
  const checkout = join(directory, "checkout");
  const destination = join(directory, "snapshot");
  try {
    const artifactPath = await writeFinancialBaselineArtifact(baselineArtifact("first"), checkout, destination);
    const retained = await readFile(artifactPath, "utf8");
    await writeFinancialBaselineArtifact(baselineArtifact("first"), checkout, destination);
    assert.equal(await readFile(artifactPath, "utf8"), retained);
    await assert.rejects(
      writeFinancialBaselineArtifact(baselineArtifact("second"), checkout, destination),
      /does not match the captured financial baseline/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the baseline writer rejects an untrusted external directory before writing", async () => {
  const destination = join(tmpdir(), `untrusted-financial-baseline-${process.pid}-${Date.now()}`);
  try {
    await assert.rejects(
      writeFinancialBaselineArtifact(baselineArtifact("first"), join(tmpdir(), "checkout"), destination),
      /trusted task temporary directory/,
    );
    assert.equal(existsSync(destination), false);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

test("the export baseline records sheet values rather than volatile workbook bytes", () => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Financial MIS");
  sheet.addRow(["Line", { formula: "1+1", result: 2 }]);
  assert.deepEqual(snapshotFinancialWorkbook(workbook), [{ name: "Financial MIS", rows: [["Line", 2]] }]);
});

const realSource = process.env.FINANCIAL_CHAT_SOURCE_FILE;
const FIXED_BASELINE_USER_ID = "00000000-0000-4000-8000-0000000000b1";
const realSourceSkip =
  process.env.FINANCIAL_CHAT_DUAL_DB_TEST !== "1"
    ? "FINANCIAL_CHAT_DUAL_DB_TEST is disabled; real-source acceptance requires the guarded runner"
    : !realSource || !existsSync(realSource)
      ? "FINANCIAL_CHAT_SOURCE_FILE is unavailable; real-source acceptance remains pending"
      : false;

test(
  "FINANCIAL_CHAT_DUAL_DB_TEST restores the fixed real-source dataset and preserves report export drill and old Ask HTTP outputs",
  { skip: realSourceSkip },
  async () => {
    const targets = assertDisposableFinancialDatabases(process.env);
    const sourcePath = realSource!;
    const oracle = await inspectFinancialSource(sourcePath);
    const legacy = await prepareLegacyFinancialSource(sourcePath);
    const checkout = join(__dirname, "../../..");
    const baselineDirectory = assertTrustedFinancialBaselineDirectory(
      process.env.FINANCIAL_CHAT_BASELINE_DIR ?? join(tmpdir(), "3f-financial-chat-baseline"),
      checkout,
    );
    const savedDataset = await readBaselineDataset(baselineDirectory, oracle.sha256, targets);
    assert.equal(legacy.sha256, oracle.sha256);
    assert.equal(legacy.excludedActualRows, oracle.actual.legacyCompatible.excludedRowCount);
    assert.ok(legacy.actualSourcePlants.includes("DUB-NUR"));
    assert.ok(oracle.actual.byPlantMonth.some(({ plant }) => plant === "DUB"));
    assert.equal(oracle.budget.rowCount, 78);
    assert.ok(oracle.budget.periods.every(({ leafCount }) => leafCount === 78));

    await migrateWarehouse();
    const warehousePool = await createWarehouseWritePool();
    const appPool = createPool();
    const appDb = createDb(appPool);
    let app: INestApplication | undefined;
    try {
      await migrate(appDb, { migrationsFolder: join(__dirname, "../../drizzle") });
      const user = baselineUser(FIXED_BASELINE_USER_ID);
      let actualBatchIds: string[];
      let budgetBatchIds: string[];
      if (savedDataset) {
        await restoreDatabaseSnapshot(warehousePool, savedDataset.warehouse);
        await restoreDatabaseSnapshot(appPool, savedDataset.app);
        actualBatchIds = savedDataset.actualBatchIds;
        budgetBatchIds = savedDataset.budgetBatchIds;
      } else {
        await resetDisposableDatabase(warehousePool);
        await resetDisposableDatabase(appPool);
        await seedBaselineAccess(appDb, user);
        const ingest = new IngestService();
        const actualLoads = [];
        for (const { upload } of legacy.actuals) actualLoads.push(await ingest.ingestActuals(upload, user.id));
        const budgetLoad = await ingest.ingestBudget(legacy.budget, user.id);
        actualBatchIds = actualLoads.map(({ batchId }) => batchId);
        budgetBatchIds = budgetLoad.periods.map(({ batchId }) => batchId);
        await writeBaselineDataset(
          baselineDirectory,
          oracle.sha256,
          targets,
          actualBatchIds,
          budgetBatchIds,
          await captureDatabaseSnapshot(warehousePool, targets.warehouse, oracle.sha256),
          await captureDatabaseSnapshot(appPool, targets.app, oracle.sha256),
        );
      }
      const accessToken = (await new SessionService(appDb).create(user.id)).accessToken;

      const budgetMonths = new Set(oracle.budget.periods.map(({ reportingMonth }) => reportingMonth));
      const period = oracle.actual.legacyCompatible.byPlantMonth
        .filter(({ plant, reportingMonth }) => plant === "DUB" && budgetMonths.has(reportingMonth))
        .map(({ reportingMonth }) => reportingMonth)
        .sort()
        .at(-1);
      assert.ok(period, "the supplied source must have one DUB month shared by Actual and Budget");
      const selection = MAPPING_MASTER.selections.find(({ plant_canonical }) => plant_canonical === "DUB");
      assert.ok(selection, "the legacy mapping master must retain DUB");

      const warehouse = new PostgresAdapter();
      const validator = new SqlValidator();
      const resolver = new SelectionResolverService(warehouse);
      const outlines = new StatementOutlineRepository(warehouse);
      const executor = new SelectionExecutor(new SqlBuilder(), validator, warehouse);
      const statements = new MisStatementService(
        resolver,
        new SemanticLayer(),
        executor,
        outlines,
        new StatementAttestationService(["financial-baseline"], 30),
      );
      const request = {
        department: selection.department,
        function: selection.function,
        plant: selection.plant_canonical,
        period,
      };
      const report = await statements.run(user, request);
      assert.equal(report.outcome, "resolved");
      if (report.outcome !== "resolved") return;
      const expectedActual = oracle.actual.legacyCompatible.byPlantMonth.find(
        (group) => group.plant === "DUB" && group.reportingMonth === period,
      )!.actual;
      assert.equal(report.grandTotal.measures[0]!.actual, expectedActual);

      const exportBytes = await new MisStatementExportService().write(report);
      const exported = new Workbook();
      await exported.xlsx.load(exportBytes as unknown as Parameters<typeof exported.xlsx.load>[0]);
      assert.ok(exported.getWorksheet("Financial MIS"));

      const resolution = await resolver.resolve(request);
      assert.equal(resolution.outcome, "resolved");
      if (resolution.outcome !== "resolved") return;
      const leaf = flatten(report.tree).find(
        (node) => node.nodeKey.startsWith("leaf:") && node.measures[0]?.actual !== "0.00",
      );
      assert.ok(leaf, "the baseline scope must contain a non-zero drillable leaf");
      const leafKey = leaf.nodeKey.slice("leaf:".length);
      const triples = (resolution.leafTargets ?? [])
        .filter(({ target }) => target.kind === "leaf" && target.leafKey === leafKey)
        .map(({ plant, costCenter, glCode }) => ({ plant, costCenter, glCode }));
      const drillRepository = new DrillTransactionsRepository(validator, warehouse);
      const drill = await drillRepository.execute(
        drillRepository.buildQueries(
          {
            actualBatchIds: report.provenance.activeBatchIds
              .filter(({ source }) => source === "actuals")
              .map(({ batchId }) => batchId),
            triples,
            plants: ["DUB"],
            from: period,
            to: period,
          },
          1,
          100,
        ),
      );
      assert.equal(drill.footer.value, leaf.measures[0]!.actual);

      const ask = await oldAskOverHttp(appDb, warehouse, period, accessToken);
      app = ask.app;
      assert.equal(ask.response.responseClass, ResponseClass.Success);
      assert.equal(ask.response.selection?.domain, "governed-financial");
      assert.deepEqual(ask.response.selection?.measureIds, ["governed-financial.actual"]);
      assert.equal(
        ask.drills.length,
        ask.response.drill?.rows.filter(({ drillable }) => drillable).length,
        "every clickable Actual must open through its issued Ask drill context",
      );
      assert.ok(ask.drills.length > 0, "the recorded old Ask answer must expose at least one clickable Actual");
      for (const issued of ask.drills) {
        const claim = ask.claims.rows.find(({ key }) => key === issued.rowKey);
        assert.ok(claim?.drillable && claim.glCode, `issued drill claims must identify ${issued.rowKey}`);
        const expected: TransactionEvidence[] = oracle.actual.rows
          .filter(
            (row) =>
              row.plant === "DUB-NUR" && row.glCode === claim.glCode && `${row.postingDate.slice(0, 7)}-01` === period,
          )
          .map(({ transactionNumber, postingDate, costCenter, debit, credit }) => ({
            txnNo: transactionNumber,
            postingDate,
            costCenter,
            debit: sourceMoney(debit),
            credit: sourceMoney(credit),
          }))
          .sort(compareEvidence);
        const opened: TransactionEvidence[] = issued.pages
          .flatMap(({ lines }) => lines)
          .map(({ txnNo, postingDate, costCenter, debit, credit }) => ({
            txnNo,
            postingDate,
            costCenter,
            debit,
            credit,
          }))
          .sort(compareEvidence);
        assert.deepEqual(opened, expected, `issued Ask drill ${issued.rowKey} must open its source transactions`);
      }

      const artifactPath = await writeFinancialBaselineArtifact(
        {
          sourceSha256: oracle.sha256,
          sourceName: sourcePath.split(/[\\/]/).at(-1)!,
          actualBatchIds,
          budgetBatchIds,
          scope: { plant: "DUB", period },
          report: withoutVolatileReportFields(report),
          exportSnapshot: snapshotFinancialWorkbook(exported),
          drill,
          ask: {
            response: stableAskSnapshot(ask.response, ask.claims),
            openedDrills: ask.drills,
          },
        },
        checkout,
        baselineDirectory,
      );
      assert.ok(existsSync(artifactPath));
      assert.equal((await appDb.select().from(auditEvents)).length >= 1, true);
    } finally {
      await app?.close();
      await warehousePool.end();
      await appPool.end();
    }
  },
);

type DatabaseTarget = FinancialDatabaseTargets["warehouse"];

interface DatabaseSnapshot {
  version: 1;
  sourceSha256: string;
  target: DatabaseTarget;
  tables: Array<{ name: string; rows: unknown[] }>;
}

interface SavedBaselineDataset {
  actualBatchIds: string[];
  budgetBatchIds: string[];
  warehouse: DatabaseSnapshot;
  app: DatabaseSnapshot;
}

async function readBaselineDataset(
  directory: string,
  sourceSha256: string,
  targets: FinancialDatabaseTargets,
): Promise<SavedBaselineDataset | undefined> {
  const manifestPath = join(directory, "dataset-manifest.json");
  const warehousePath = join(directory, "warehouse-dataset.json");
  const appPath = join(directory, "app-dataset.json");
  const present = [manifestPath, warehousePath, appPath].map(existsSync);
  if (present.every((value) => !value)) return undefined;
  if (!present.every(Boolean)) throw new Error("Financial baseline dataset is incomplete and refuses database writes");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    version?: unknown;
    sourceSha256?: unknown;
    targets?: unknown;
    actualBatchIds?: unknown;
    budgetBatchIds?: unknown;
  };
  if (
    manifest.version !== 1 ||
    manifest.sourceSha256 !== sourceSha256 ||
    !sameTargets(manifest.targets, targets) ||
    !stringArray(manifest.actualBatchIds) ||
    !stringArray(manifest.budgetBatchIds)
  ) {
    throw new Error("Financial baseline dataset identity is invalid and refuses database writes");
  }
  const warehouse = parseDatabaseSnapshot(await readFile(warehousePath, "utf8"), sourceSha256, targets.warehouse);
  const app = parseDatabaseSnapshot(await readFile(appPath, "utf8"), sourceSha256, targets.app);
  return {
    actualBatchIds: manifest.actualBatchIds,
    budgetBatchIds: manifest.budgetBatchIds,
    warehouse,
    app,
  };
}

async function captureDatabaseSnapshot(
  pool: Pool,
  target: DatabaseTarget,
  sourceSha256: string,
): Promise<DatabaseSnapshot> {
  const names = await publicTableNames(pool);
  const tables: DatabaseSnapshot["tables"] = [];
  for (const name of names) {
    const result = await pool.query<{ rows: unknown[] }>(
      `SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY to_jsonb(record)::text), '[]'::jsonb) AS rows FROM public.${quoted(name)} AS record`,
    );
    tables.push({ name, rows: result.rows[0]!.rows });
  }
  return { version: 1, sourceSha256, target, tables };
}

async function writeBaselineDataset(
  directory: string,
  sourceSha256: string,
  targets: FinancialDatabaseTargets,
  actualBatchIds: string[],
  budgetBatchIds: string[],
  warehouse: DatabaseSnapshot,
  app: DatabaseSnapshot,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const files = ["warehouse-dataset.json", "app-dataset.json", "dataset-manifest.json"];
  if (files.some((name) => existsSync(join(directory, name)))) {
    throw new Error("Financial baseline dataset already exists and cannot be replaced");
  }
  const temporary = files.map((name) => join(directory, `.${name}.${process.pid}.tmp`));
  try {
    await writeFile(temporary[0]!, `${JSON.stringify(warehouse)}\n`, { flag: "wx" });
    await writeFile(temporary[1]!, `${JSON.stringify(app)}\n`, { flag: "wx" });
    await writeFile(
      temporary[2]!,
      `${JSON.stringify({ version: 1, sourceSha256, targets, actualBatchIds, budgetBatchIds }, null, 2)}\n`,
      { flag: "wx" },
    );
    for (let index = 0; index < files.length; index += 1) {
      await rename(temporary[index]!, join(directory, files[index]!));
    }
  } finally {
    await Promise.all(temporary.map((path) => rm(path, { force: true })));
  }
}

async function restoreDatabaseSnapshot(pool: Pool, snapshot: DatabaseSnapshot): Promise<void> {
  const currentTables = await publicTableNames(pool);
  const current = new Set(currentTables);
  if (snapshot.tables.some(({ name }) => !current.has(name))) {
    throw new Error("Financial baseline dataset does not match the disposable database schema");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    if (currentTables.length) {
      await client.query(`TRUNCATE ${currentTables.map((name) => `public.${quoted(name)}`).join(", ")} CASCADE`);
    }
    for (const table of snapshot.tables) {
      if (!table.rows.length) continue;
      const identifier = `public.${quoted(table.name)}`;
      await client.query(
        `INSERT INTO ${identifier} SELECT * FROM jsonb_populate_recordset(NULL::${identifier}, $1::jsonb)`,
        [JSON.stringify(table.rows)],
      );
      const count = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${identifier}`);
      if (count.rows[0]!.count !== String(table.rows.length)) {
        throw new Error("Financial baseline dataset restore row count does not match");
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function resetDisposableDatabase(pool: Pool): Promise<void> {
  const tables = await publicTableNames(pool);
  if (tables.length) await pool.query(`TRUNCATE ${tables.map((name) => `public.${quoted(name)}`).join(", ")} CASCADE`);
}

async function publicTableNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return result.rows.map(({ table_name }) => table_name);
}

function parseDatabaseSnapshot(raw: string, sourceSha256: string, target: DatabaseTarget): DatabaseSnapshot {
  const value = JSON.parse(raw) as Partial<DatabaseSnapshot>;
  if (
    value.version !== 1 ||
    value.sourceSha256 !== sourceSha256 ||
    !sameTarget(value.target, target) ||
    !Array.isArray(value.tables) ||
    value.tables.some(
      (table) =>
        !table ||
        typeof table.name !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name) ||
        !Array.isArray(table.rows),
    ) ||
    new Set(value.tables.map(({ name }) => name)).size !== value.tables.length
  ) {
    throw new Error("Financial baseline database snapshot is invalid and refuses database writes");
  }
  return value as DatabaseSnapshot;
}

function sameTargets(value: unknown, expected: FinancialDatabaseTargets): boolean {
  if (!value || typeof value !== "object") return false;
  const targets = value as Partial<FinancialDatabaseTargets>;
  return sameTarget(targets.warehouse, expected.warehouse) && sameTarget(targets.app, expected.app);
}

function sameTarget(value: unknown, expected: DatabaseTarget): boolean {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<DatabaseTarget>;
  return target.host === expected.host && target.port === expected.port && target.database === expected.database;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

function quoted(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error("Financial baseline table name is invalid");
  return `"${identifier}"`;
}

async function seedBaselineAccess(appDb: ReturnType<typeof createDb>, user: AuthUser): Promise<void> {
  await appDb.insert(roles).values({ name: "admin", label: "Administrator" });
  await appDb
    .insert(users)
    .values({ id: user.id, email: user.email, displayName: user.display_name, isActive: user.is_active });
  await appDb.insert(userRoles).values({ userId: user.id, role: "admin" });
  await appDb
    .insert(rolePerms)
    .values([
      ...user.permissions.actions.map((grantId) => ({ role: "admin", grantType: "action", grantId })),
      ...user.permissions.domains.map((grantId) => ({ role: "admin", grantType: "domain", grantId })),
      ...user.permissions.measureIds.map((grantId) => ({ role: "admin", grantType: "measure", grantId })),
      ...user.permissions.dimensionIds.map((grantId) => ({ role: "admin", grantType: "dimension", grantId })),
    ]);
  await appDb.insert(userScope).values(user.scope.map((scope) => ({ userId: user.id, ...scope })));
}

async function oldAskOverHttp(
  appDb: ReturnType<typeof createDb>,
  warehouse: PostgresAdapter,
  period: string,
  accessToken: string,
): Promise<{
  app: INestApplication;
  response: AskResponse;
  claims: AskDrillContextClaims;
  drills: Array<{ rowKey: string; pages: AskDrillResponse[] }>;
}> {
  const semantic = new SemanticLayer();
  const validator = new SqlValidator();
  const executor = new SelectionExecutor(new SqlBuilder(), validator, warehouse);
  const outlines = new StatementOutlineRepository(warehouse);
  const glNames = new GlNameRepository(validator, warehouse, outlines);
  const drillTransactions = new DrillTransactionsRepository(validator, warehouse);
  const dimensionValues = new DimensionValuesService(warehouse);
  const resolver = new SelectionResolverService(warehouse);
  const selection: Selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
    timeWindow: { grain: "month", from: period, to: period },
  };
  const recordedProvider: LlmProvider = {
    async select() {
      return { kind: "selection", selection };
    },
  };
  const audit = new AuditService(appDb);
  const drillContexts = new AskDrillContextService(["financial-baseline"], 30);
  const attestation = new StatementAttestationService(["financial-baseline"], 30);
  const statements = new MisStatementService(resolver, semantic, executor, outlines, attestation);
  const statementDrills = new MisDrillService(resolver, statements, outlines, drillTransactions, audit);
  const grounding = new StatementGroundingService(attestation, statementDrills);
  class BaselineHttpModule {}
  Module({
    controllers: [ChatController, AskDrillController],
    providers: [
      { provide: SemanticLayer, useValue: semantic },
      { provide: SelectionExecutor, useValue: executor },
      { provide: AuditService, useValue: audit },
      { provide: DimensionValuesService, useValue: dimensionValues },
      { provide: ReportsService, useValue: new ReportsService(semantic, executor, warehouse) },
      { provide: HelpService, useValue: new HelpService(semantic, dimensionValues, resolver) },
      { provide: SelectionResolverService, useValue: resolver },
      { provide: LLM_PROVIDER, useValue: recordedProvider },
      { provide: StatementExplanationService, useValue: new StatementExplanationService(grounding, statementDrills) },
      { provide: GlNameRepository, useValue: glNames },
      { provide: DrillTransactionsRepository, useValue: drillTransactions },
      { provide: AskDrillContextService, useValue: drillContexts },
      { provide: StatementOutlineRepository, useValue: outlines },
      { provide: StatementAttestationService, useValue: attestation },
      ChatService,
      { provide: SessionService, useValue: new SessionService(appDb) },
      { provide: RbacService, useValue: new RbacService(appDb, warehouse, semantic) },
      AuthGuard,
      AskDrillService,
    ],
  })(BaselineHttpModule);
  const app = await NestFactory.create(BaselineHttpModule, { logger: false, abortOnError: false });
  await app.listen(0, "127.0.0.1");
  try {
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${period}T00:00:00Z`),
    );
    const response = await fetch(`${await app.getUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${AUTH_COOKIE_NAMES.access}=${accessToken}` },
      body: JSON.stringify({ question: `Show Actual by GL for ${monthLabel} in DUB` }),
    });
    assert.equal(response.status, 201);
    const answer = (await response.json()) as AskResponse;
    assert.ok(answer.drill, "the recorded old Ask answer must issue transaction drill metadata");
    const verification = drillContexts.verify(answer.drill.context, FIXED_BASELINE_USER_ID);
    assert.equal(verification.outcome, "verified");
    if (verification.outcome !== "verified") throw new Error("Old Ask issued an unverifiable drill context");
    const openedDrills: Array<{ rowKey: string; pages: AskDrillResponse[] }> = [];
    for (const row of answer.drill.rows.filter(({ drillable }) => drillable)) {
      const pages: AskDrillResponse[] = [];
      let page = 1;
      do {
        const opened = await fetch(`${await app.getUrl()}/api/chat/drill`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `${AUTH_COOKIE_NAMES.access}=${accessToken}` },
          body: JSON.stringify({ context: answer.drill.context, rowKey: row.key, page }),
        });
        assert.equal(opened.status, 200, `issued Ask drill ${row.key} page ${page} must open`);
        const result = (await opened.json()) as AskDrillResponse;
        assert.equal(result.rowKey, row.key);
        assert.equal(result.page, page);
        assert.equal(result.footer.value, pages[0]?.footer.value ?? result.footer.value);
        assert.deepEqual(result.batchStatuses, pages[0]?.batchStatuses ?? result.batchStatuses);
        pages.push(result);
        page += 1;
      } while ((page - 1) * pages[0]!.pageSize < pages[0]!.totalCount);
      openedDrills.push({ rowKey: row.key, pages });
    }
    return { app, response: answer, claims: verification.claims, drills: openedDrills };
  } catch (error) {
    await app.close();
    throw error;
  }
}

function baselineUser(id: string): AuthUser {
  return {
    id,
    email: "financial-baseline@example.test",
    display_name: "Financial baseline",
    is_active: true,
    roles: ["admin"],
    permissions: {
      actions: ["report"],
      domains: ["mis-statement", "governed-financial"],
      measureIds: [
        "mis-statement.actual_net",
        "mis-statement.budget_net",
        "mis-statement.rollover_net",
        "mis-statement.percentage",
        "governed-financial.actual",
      ],
      dimensionIds: ["leaf_key", "gl_code"],
    },
    scope: [
      { attribute: "plant", value: "DUB" },
      { attribute: "department", value: "Agriculture" },
      { attribute: "function", value: "Nursery" },
    ],
  };
}

function flatten(nodes: MisStatementNode[]): MisStatementNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function withoutVolatileReportFields<T extends { attestedContext?: unknown }>(report: T): Omit<T, "attestedContext"> {
  const { attestedContext: _attestedContext, ...stable } = report;
  return stable;
}

function stableAskSnapshot(response: AskResponse, claims: AskDrillContextClaims): unknown {
  const { latencyMs: _latencyMs, sessionId: _sessionId, ...stable } = response;
  const { exp: _exp, ...stableClaims } = claims;
  return {
    ...stable,
    ...(response.drill
      ? {
          drill: { ...response.drill, context: "<issued-token>" },
          drillClaims: { ...stableClaims, exp: "<expiry>" },
        }
      : {}),
  };
}

function sourceMoney(raw: string | null): string {
  assert.notEqual(raw, null, "a legacy-compatible source transaction must contain Debit and Credit");
  const match = raw!.replaceAll(",", "").match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  assert.ok(match, "source transaction money must be decimal text");
  const fraction = match[3] ?? "";
  let paise = BigInt(match[2]!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  if (fraction[2] && Number(fraction[2]) >= 5) paise += 1n;
  if (match[1] === "-") paise = -paise;
  const sign = paise < 0 ? "-" : "";
  const absolute = paise < 0 ? -paise : paise;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

interface TransactionEvidence {
  txnNo: string | null;
  postingDate: string;
  costCenter: string | null;
  debit: string;
  credit: string;
}

function compareEvidence(left: TransactionEvidence, right: TransactionEvidence): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

async function writeMinimalOracle(
  path: string,
  postingDate: unknown,
  debit: unknown,
  credit: unknown = "0",
): Promise<void> {
  const workbook = new Workbook();
  const actual = workbook.addWorksheet("Actual");
  actual.addRow([
    "Transaction Number",
    "Line_Id",
    "Posting Date",
    "Month",
    "Plant",
    "Cost Center",
    "MIS GL Code",
    "AcctName",
    "Debit",
    "Credit",
  ]);
  actual.addRow(["T-1", "1", postingDate, "apr", "DUB", "CC-1", "4100", "Seed", debit, credit]);
  const budget = workbook.addWorksheet("Budget");
  budget.addRow(["S. No.", "Budget Components", "GL Codes", "Apr-26", "Apr-26"]);
  budget.addRow(["", "", "", "Budget", "Roll Over Budget"]);
  budget.addRow(["1", "Seed", "4100", "1", "0"]);
  await writeFile(path, Buffer.from(await workbook.xlsx.writeBuffer()));
}

function baselineArtifact(marker: string) {
  return {
    sourceSha256: "a".repeat(64),
    sourceName: "source.xlsx",
    actualBatchIds: ["actual-batch"],
    budgetBatchIds: ["budget-batch"],
    scope: { plant: "DUB", period: "2026-04-01" },
    report: { marker },
    exportSnapshot: [{ name: "Financial MIS", rows: [[marker]] }],
    drill: { marker },
    ask: { marker },
  };
}
