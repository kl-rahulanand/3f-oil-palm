import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ResponseClass, type AskResponse, type AuthUser, type MisStatementNode, type Selection } from "@3f/contract";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Workbook } from "exceljs";
import { AuthGuard } from "../auth/auth.guard";
import { AUTH_COOKIE_NAMES } from "../auth/cookies";
import { ChatController } from "../chat/chat.controller";
import { AskDrillContextService } from "../chat/ask-drill-context";
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
import { assertDisposableFinancialDatabases } from "./financial-disposable-db.guard";
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
    ]);
    actual.addRow([
      "Nursery",
      "T-2",
      "1",
      "2026-04-06",
      "apr",
      "",
      "",
      "4200",
      "Freight",
      "0",
      "10.005",
      "",
      "kept",
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
    ]);

    const budget = workbook.addWorksheet("Nursery Financial MIS");
    budget.getCell("A1").value = { formula: 'TEXT(A2,"mmm")', result: "#VALUE!" };
    budget.getCell("A1").numFmt = "mmm-yy";
    budget.addRow(["S. No.", "Budget Components", "GL Codes", "Apr-26", "Apr-26", "May-26", "May-26"]);
    budget.addRow(["", "", "", "Budget", "Roll Over Budget", "Budget", "Roll Over Budget"]);
    budget.addRow([
      "1",
      "Nursery total",
      "",
      { formula: "SUM(D5:D6)", result: 90.005 },
      { formula: "SUM(E5:E6)", result: 4.004 },
      { formula: "SUM(F5:F6)", result: 90 },
      { formula: "SUM(G5:G6)", result: 5 },
    ]);
    budget.addRow([
      "1",
      "Seed",
      "4100",
      "80.005",
      { formula: "4.004", result: 4.004, ref: "E5:E6", shareType: "shared" },
      "90",
      "5",
    ]);
    budget.addRow(["2", "Freight", "4200", "10", { sharedFormula: "E5", result: 0 }, "", ""]);

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
      ],
      rowCount: 3,
      debit: "120.13",
      credit: "15.13",
      actual: "105.00",
      reportingMonths: ["2026-04-01", "2026-05-01"],
      byPlantMonth: [
        { plant: null, reportingMonth: "2026-04-01", rowCount: 1, actual: "-10.01" },
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

test("the baseline writer retains the first snapshot for a checksummed source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "3f-financial-baseline-retention-"));
  const checkout = join(directory, "checkout");
  const destination = join(directory, "snapshot");
  try {
    const artifactPath = await writeFinancialBaselineArtifact(baselineArtifact("first"), checkout, destination);
    const retained = await readFile(artifactPath, "utf8");
    await writeFinancialBaselineArtifact(baselineArtifact("second"), checkout, destination);
    assert.equal(await readFile(artifactPath, "utf8"), retained);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the export baseline records sheet values rather than volatile workbook bytes", () => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Financial MIS");
  sheet.addRow(["Line", { formula: "1+1", result: 2 }]);
  assert.deepEqual(snapshotFinancialWorkbook(workbook), [{ name: "Financial MIS", rows: [["Line", 2]] }]);
});

const realSource = process.env.FINANCIAL_CHAT_SOURCE_FILE;
const realSourceSkip =
  process.env.FINANCIAL_CHAT_DUAL_DB_TEST !== "1"
    ? "FINANCIAL_CHAT_DUAL_DB_TEST is disabled; real-source acceptance requires the guarded runner"
    : !realSource || !existsSync(realSource)
      ? "FINANCIAL_CHAT_SOURCE_FILE is unavailable; real-source acceptance remains pending"
      : false;

test(
  "FINANCIAL_CHAT_DUAL_DB_TEST preserves real-source report export drill and old Ask HTTP outputs",
  { skip: realSourceSkip },
  async () => {
    assertDisposableFinancialDatabases(process.env);
    const sourcePath = realSource!;
    const oracle = await inspectFinancialSource(sourcePath);
    const legacy = await prepareLegacyFinancialSource(sourcePath);
    assert.equal(legacy.sha256, oracle.sha256);
    assert.equal(legacy.excludedActualRows, oracle.actual.legacyCompatible.excludedRowCount);
    assert.ok(legacy.actualSourcePlants.includes("DUB-NUR"));
    assert.ok(oracle.actual.byPlantMonth.some(({ plant }) => plant === "DUB"));

    await migrateWarehouse();
    const warehousePool = await createWarehouseWritePool();
    const appPool = createPool();
    const appDb = createDb(appPool);
    let app: INestApplication | undefined;
    try {
      await migrate(appDb, { migrationsFolder: join(__dirname, "../../drizzle") });
      await warehousePool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      await appPool.query("TRUNCATE audit_events, users, roles CASCADE");
      await appDb.insert(roles).values({ name: "admin", label: "Administrator" });
      const inserted = await appDb
        .insert(users)
        .values({ email: "financial-baseline@example.test", displayName: "Financial baseline", isActive: true })
        .returning({ id: users.id });
      const user = baselineUser(inserted[0]!.id);
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
      const accessToken = (await new SessionService(appDb).create(user.id)).accessToken;

      const ingest = new IngestService();
      const actualLoads = [];
      for (const { upload } of legacy.actuals) actualLoads.push(await ingest.ingestActuals(upload, user.id));
      const budgetLoad = await ingest.ingestBudget(legacy.budget, user.id);

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

      const artifactPath = await writeFinancialBaselineArtifact(
        {
          sourceSha256: oracle.sha256,
          sourceName: sourcePath.split(/[\\/]/).at(-1)!,
          actualBatchIds: actualLoads.map(({ batchId }) => batchId),
          budgetBatchIds: budgetLoad.periods.map(({ batchId }) => batchId),
          scope: { plant: "DUB", period },
          report: withoutVolatileReportFields(report),
          exportSnapshot: snapshotFinancialWorkbook(exported),
          drill,
          ask: withoutVolatileAskFields(ask.response),
        },
        join(__dirname, "../../.."),
        process.env.FINANCIAL_CHAT_BASELINE_DIR,
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

async function oldAskOverHttp(
  appDb: ReturnType<typeof createDb>,
  warehouse: PostgresAdapter,
  period: string,
  accessToken: string,
): Promise<{ app: INestApplication; response: AskResponse }> {
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
  const attestation = new StatementAttestationService(["financial-baseline"], 30);
  const statements = new MisStatementService(resolver, semantic, executor, outlines, attestation);
  const drills = new MisDrillService(resolver, statements, outlines, drillTransactions, audit);
  const grounding = new StatementGroundingService(attestation, drills);
  class BaselineHttpModule {}
  Module({
    controllers: [ChatController],
    providers: [
      { provide: SemanticLayer, useValue: semantic },
      { provide: SelectionExecutor, useValue: executor },
      { provide: AuditService, useValue: audit },
      { provide: DimensionValuesService, useValue: dimensionValues },
      { provide: ReportsService, useValue: new ReportsService(semantic, executor, warehouse) },
      { provide: HelpService, useValue: new HelpService(semantic, dimensionValues, resolver) },
      { provide: SelectionResolverService, useValue: resolver },
      { provide: LLM_PROVIDER, useValue: recordedProvider },
      { provide: StatementExplanationService, useValue: new StatementExplanationService(grounding, drills) },
      { provide: GlNameRepository, useValue: glNames },
      { provide: DrillTransactionsRepository, useValue: drillTransactions },
      { provide: AskDrillContextService, useValue: new AskDrillContextService(["financial-baseline"], 30) },
      { provide: StatementOutlineRepository, useValue: outlines },
      { provide: StatementAttestationService, useValue: attestation },
      ChatService,
      { provide: SessionService, useValue: new SessionService(appDb) },
      { provide: RbacService, useValue: new RbacService(appDb, warehouse, semantic) },
      AuthGuard,
    ],
  })(BaselineHttpModule);
  const app = await NestFactory.create(BaselineHttpModule, { logger: false, abortOnError: false });
  await app.listen(0, "127.0.0.1");
  const response = await fetch(`${await app.getUrl()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${AUTH_COOKIE_NAMES.access}=${accessToken}` },
    body: JSON.stringify({ question: "Show Actual by GL for the recorded DUB month" }),
  });
  assert.equal(response.status, 201);
  return { app, response: (await response.json()) as AskResponse };
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

function withoutVolatileAskFields(response: AskResponse): Omit<AskResponse, "latencyMs" | "sessionId" | "drill"> {
  const { latencyMs: _latencyMs, sessionId: _sessionId, drill: _drill, ...stable } = response;
  return stable;
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
