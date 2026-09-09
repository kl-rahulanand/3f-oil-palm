import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { Workbook, type CellValue, type Worksheet } from "exceljs";
import { z } from "zod";
import {
  createWarehouseWritePool,
  type CandidateBatchMetadata,
  type IIngestionRepository,
  type MisBudgetInput,
  type SapTransactionInput,
} from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import { MAX_ACTUALS_UPLOAD_BYTES } from "./ingest.schemas";
import { IngestService, type UploadedWorkbook } from "./ingest.service";
import type { ParsedMisBudget } from "./mis-budget.parser";
import { type ParsedSapActuals, SapActualsArchiveLimitError, SapActualsRowLimitError } from "./sap-actuals.parser";

const HEADERS = [
  "#",
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
  "ShortName",
  "ContraAct",
  "LineMemo",
  "Comments",
  "Comments",
  "Origin",
  "Reference 1",
  "Loc.",
];

test("the ingest service validates every parsed row before any write, rejects an invalid or mixed-period file with row-level diagnostics and makes no repository call, and on success calls replaceActualsBatch exactly once with the authenticated uploader metadata", async () => {
  const service = new RecordingIngestService();
  const validBuffer = await workbookBuffer([sapRow({ rowNumber: 200, transactionNumber: "TXN-FILE", lineId: "1" })]);
  await assert.rejects(
    service.ingestActuals({ ...asUpload(validBuffer), mimetype: "application/octet-stream" }, "user-1"),
    (error: unknown) => error instanceof z.ZodError && error.issues[0]?.path.join(".") === "file",
  );
  await assert.rejects(
    service.ingestActuals({ ...asUpload(validBuffer), size: MAX_ACTUALS_UPLOAD_BYTES + 1 }, "user-1"),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 413,
  );
  await assert.rejects(
    new RowLimitIngestService().ingestActuals(asUpload(validBuffer), "user-1"),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 413,
  );
  await assert.rejects(
    new ArchiveLimitIngestService().ingestActuals(asUpload(validBuffer), "user-1"),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 413,
  );
  assert.equal(service.calls.length, 0);

  const invalid = asUpload(
    await workbookBuffer([
      sapRow({ rowNumber: 201, transactionNumber: "TXN-BAD", lineId: "1", debit: "bad" }),
      sapRow({
        rowNumber: 202,
        transactionNumber: "TXN-MIXED",
        lineId: "2",
        date: new Date("2026-08-01T00:00:00Z"),
        month: "Aug",
      }),
    ]),
  );

  await assert.rejects(service.ingestActuals(invalid, "user-1"), (error: unknown) => {
    assert.ok(error instanceof z.ZodError);
    assert.deepEqual(
      error.issues.map(({ path }) => path),
      [
        ["rows", 4, "debit"],
        ["rows", 5, "month"],
      ],
    );
    return true;
  });
  assert.equal(service.calls.length, 0);

  const response = await service.ingestActuals(
    asUpload(
      await workbookBuffer([
        sapRow({ rowNumber: 203, transactionNumber: "TXN-OK", lineId: "", debit: 10.1, credit: 0.03 }),
      ]),
    ),
    "authenticated-user-id",
  );

  assert.deepEqual(response, {
    batchId: "11111111-1111-4111-8111-111111111111",
    period: "2026-07-01",
    rowCount: 1,
  });
  assert.equal(service.calls.length, 1);
  assert.deepEqual(service.calls[0].metadata, {
    period: "2026-07-01",
    uploadedBy: "authenticated-user-id",
    validationResult: { valid: true, rowCount: 1, period: "2026-07-01", headerRow: 3 },
    reconciliationResult: {},
  });
  assert.equal(service.calls[0].rows[0].lineId, "203");
  assert.equal(service.calls[0].rows[0].plant, "DUB");
  assert.equal(service.calls[0].rows[0].raw?.Comments_2, "Second comment");
  assert.equal(service.calls[0].rows[0].memo, "Line memo");
  assert.equal(service.calls[0].rows[0].reference, "REF-1");
  assert.equal("actual" in service.calls[0].rows[0], false);
});

test("the ingest service validates the whole budget workbook before any write, makes no repository call on an invalid workbook, and on success replaces every present period through replaceBudgetBatch inside one outer all-or-nothing transaction so a failure on a later period rolls back every earlier one, without touching sap_transaction", async () => {
  const service = new RecordingBudgetIngestService();
  await assert.rejects(
    service.ingestBudget(
      asBudgetUpload(
        await budgetWorkbookBuffer((sheet) => {
          addBudgetRow(sheet, { aprilBudget: "bad", aprilRollover: 0, mayBudget: 1, mayRollover: 0 });
        }),
      ),
      "user-1",
    ),
    (error: unknown) => error instanceof z.ZodError && error.issues[0]?.path.join(".") === "rows.5.budgetAmount",
  );
  assert.equal(service.transactionCount, 0);
  assert.equal(service.budgetCalls.length, 0);

  const upload = asBudgetUpload(
    await budgetWorkbookBuffer((sheet) => {
      addBudgetRow(sheet, { aprilBudget: 10, aprilRollover: 1, mayBudget: 20, mayRollover: 2 });
    }),
  );
  assert.deepEqual(await service.ingestBudget(upload, "authenticated-user-id"), {
    formatId: "nursery-mis-financial-v1",
    plant: "DUB",
    periods: [
      { period: "2026-04-01", batchId: "11111111-1111-4111-8111-000000000001", rowCount: 1 },
      { period: "2026-05-01", batchId: "11111111-1111-4111-8111-000000000002", rowCount: 1 },
    ],
    totalRowCount: 2,
  });
  assert.equal(service.transactionCount, 1);
  assert.equal(service.budgetCalls.length, 2);
  assert.deepEqual(service.activePeriods, ["2026-04-01", "2026-05-01"]);
  assert.equal(service.actualCalls, 0);
  assert.deepEqual(
    service.budgetCalls.map(({ metadata, rows }) => ({
      period: metadata.period,
      uploadedBy: metadata.uploadedBy,
      formatId: rows[0].formatId,
      rowPeriod: rows[0].period,
    })),
    [
      {
        period: "2026-04-01",
        uploadedBy: "authenticated-user-id",
        formatId: "nursery-mis-financial-v1",
        rowPeriod: "2026-04-01",
      },
      {
        period: "2026-05-01",
        uploadedBy: "authenticated-user-id",
        formatId: "nursery-mis-financial-v1",
        rowPeriod: "2026-05-01",
      },
    ],
  );

  service.failOnBudgetCall = 4;
  await assert.rejects(service.ingestBudget(upload, "user-2"), /later period failed/);
  assert.equal(service.transactionCount, 2);
  assert.deepEqual(service.activePeriods, ["2026-04-01", "2026-05-01"]);
  assert.equal(service.actualCalls, 0);
});

test(
  "WAREHOUSE_DB_TEST actuals ingest retains the prior batch and activates one paise-precise replacement with raw data",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    await migrateWarehouse();
    const service = new IngestService();
    const suffix = randomUUID();
    const first = await service.ingestActuals(
      asUpload(
        await workbookBuffer([
          sapRow({
            rowNumber: 301,
            transactionNumber: `DB-FIRST-${suffix}`,
            lineId: "1",
            date: new Date("2098-09-15T00:00:00Z"),
            month: "Sep",
            debit: 1,
            credit: 0.01,
          }),
        ]),
      ),
      `db-proof-${suffix}`,
    );
    const replacement = await service.ingestActuals(
      asUpload(
        await workbookBuffer([
          sapRow({
            rowNumber: 302,
            transactionNumber: `DB-SECOND-${suffix}`,
            lineId: "2",
            date: new Date("2098-09-16T00:00:00Z"),
            month: "Sep",
            debit: 10,
            credit: 2.5,
          }),
        ]),
      ),
      `db-proof-${suffix}`,
    );

    const pool = await createWarehouseWritePool();
    try {
      const batches = await pool.query<{ id: string; is_active: boolean }>(
        "SELECT id, is_active FROM ingest_batch WHERE id = ANY($1::uuid[]) ORDER BY id",
        [[first.batchId, replacement.batchId]],
      );
      assert.equal(batches.rows.length, 2);
      assert.equal(batches.rows.find(({ id }) => id === first.batchId)?.is_active, false);
      assert.equal(batches.rows.find(({ id }) => id === replacement.batchId)?.is_active, true);

      const rawRows = await pool.query<{ batch_id: string; raw: Record<string, string> }>(
        "SELECT batch_id, raw FROM sap_transaction WHERE batch_id = ANY($1::uuid[]) ORDER BY batch_id",
        [[first.batchId, replacement.batchId]],
      );
      assert.equal(rawRows.rows.length, 2);
      assert.equal(
        rawRows.rows.find(({ batch_id }) => batch_id === replacement.batchId)?.raw.Comments_2,
        "Second comment",
      );

      const gold = await pool.query<{ actual_net: string }>(
        "SELECT actual_net FROM actual_by_key_month WHERE plant = $1 AND cost_center = $2 AND gl_code = $3 AND month = $4",
        ["DUB", "CC-1", "50001701", "2098-09-01"],
      );
      assert.deepEqual(gold.rows, [{ actual_net: "7.50" }]);
    } finally {
      await pool.end();
    }
  },
);

test(
  "WAREHOUSE_DB_TEST budget ingest atomically replaces every period, retains prior batches, rolls back a later-period failure, and does not mutate actuals",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    await migrateWarehouse();
    const suffix = randomUUID();
    const upload = asBudgetUpload(
      await budgetWorkbookBuffer(
        (sheet) => addBudgetRow(sheet, { aprilBudget: 10, aprilRollover: 1, mayBudget: 20, mayRollover: 2 }),
        [new Date("2097-04-01T00:00:00Z"), new Date("2097-05-01T00:00:00Z")],
      ),
    );
    const pool = await createWarehouseWritePool();
    try {
      const actualsBefore = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM sap_transaction");
      const service = new IngestService();
      const first = await service.ingestBudget(upload, `budget-first-${suffix}`);
      const replacement = await service.ingestBudget(upload, `budget-replacement-${suffix}`);
      const batchIds = [...first.periods, ...replacement.periods].map(({ batchId }) => batchId);
      const batches = await pool.query<{ id: string; is_active: boolean }>(
        "SELECT id, is_active FROM ingest_batch WHERE id = ANY($1::uuid[])",
        [batchIds],
      );
      assert.equal(batches.rows.length, 4);
      assert.ok(
        first.periods.every(({ batchId }) => batches.rows.find(({ id }) => id === batchId)?.is_active === false),
      );
      assert.ok(
        replacement.periods.every(({ batchId }) => batches.rows.find(({ id }) => id === batchId)?.is_active === true),
      );
      const retainedRows = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM mis_budget WHERE batch_id = ANY($1::uuid[])",
        [batchIds],
      );
      assert.equal(retainedRows.rows[0].count, "4");

      await assert.rejects(new InvalidSecondPeriodBudgetService().ingestBudget(upload, `budget-fail-${suffix}`));
      const active = await pool.query<{ period: string; id: string }>(
        "SELECT period::text, id FROM ingest_batch WHERE source_kind = 'budget' AND is_active AND period = ANY($1::date[]) ORDER BY period",
        [replacement.periods.map(({ period }) => period)],
      );
      assert.deepEqual(
        active.rows.map(({ id }) => id),
        replacement.periods.map(({ batchId }) => batchId),
      );
      const failedBatches = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM ingest_batch WHERE uploaded_by = $1",
        [`budget-fail-${suffix}`],
      );
      assert.equal(failedBatches.rows[0].count, "0");
      const actualsAfter = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM sap_transaction");
      assert.equal(actualsAfter.rows[0].count, actualsBefore.rows[0].count);
    } finally {
      await pool.end();
    }
  },
);

class RecordingIngestService extends IngestService {
  readonly calls: Array<{ metadata: CandidateBatchMetadata; rows: SapTransactionInput[] }> = [];

  protected override async replaceActualsBatch(
    metadata: CandidateBatchMetadata,
    rows: SapTransactionInput[],
  ): Promise<string> {
    this.calls.push({ metadata, rows });
    return "11111111-1111-4111-8111-111111111111";
  }
}

class RowLimitIngestService extends RecordingIngestService {
  protected override parseWorkbook(): Promise<ParsedSapActuals> {
    return Promise.reject(new SapActualsRowLimitError(25_000));
  }
}

class ArchiveLimitIngestService extends RecordingIngestService {
  protected override parseWorkbook(): Promise<ParsedSapActuals> {
    return Promise.reject(new SapActualsArchiveLimitError("archive limit"));
  }
}

class RecordingBudgetIngestService extends IngestService {
  readonly budgetCalls: Array<{ metadata: CandidateBatchMetadata; rows: MisBudgetInput[] }> = [];
  readonly activePeriods: string[] = [];
  transactionCount = 0;
  actualCalls = 0;
  failOnBudgetCall?: number;

  protected override async withBudgetRepository<T>(run: (repository: IIngestionRepository) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const snapshot = [...this.activePeriods];
    const repository: IIngestionRepository = {
      replaceActualsBatch: async () => {
        this.actualCalls += 1;
        throw new Error("actuals must not be touched");
      },
      replaceBudgetBatch: async (metadata, rows) => {
        this.budgetCalls.push({ metadata, rows });
        if (this.budgetCalls.length === this.failOnBudgetCall) throw new Error("later period failed");
        if (!this.activePeriods.includes(metadata.period)) this.activePeriods.push(metadata.period);
        return `11111111-1111-4111-8111-${this.budgetCalls.length.toString().padStart(12, "0")}`;
      },
    };
    try {
      return await run(repository);
    } catch (error) {
      this.activePeriods.splice(0, this.activePeriods.length, ...snapshot);
      throw error;
    }
  }
}

class InvalidSecondPeriodBudgetService extends IngestService {
  protected override async parseBudgetWorkbook(buffer: Buffer): Promise<ParsedMisBudget> {
    const parsed = await super.parseBudgetWorkbook(buffer);
    parsed.periods[1].rows[0].period = parsed.periods[0].period;
    return parsed;
  }
}

function asUpload(buffer: Buffer): UploadedWorkbook {
  return {
    originalname: "actuals.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
}

function asBudgetUpload(buffer: Buffer): UploadedWorkbook {
  return { ...asUpload(buffer), originalname: "budget.xlsx" };
}

async function workbookBuffer(rows: CellValue[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Fixture");
  worksheet.getRow(3).values = HEADERS;
  rows.forEach((row, index) => {
    worksheet.getRow(index + 4).values = row;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function budgetWorkbookBuffer(
  build: (sheet: Worksheet) => void,
  periods = [new Date("2026-04-01T00:00:00Z"), new Date("2026-05-01T00:00:00Z")],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Fixture");
  sheet.getCell(2, 1).value = "S. No.";
  sheet.getCell(2, 2).value = "Budget Components";
  sheet.getCell(2, 6).value = "GL Codes";
  periods.forEach((period, index) => {
    const column = 7 + index * 4;
    sheet.mergeCells(2, column, 2, column + 3);
    sheet.getCell(2, column).value = period;
    ["Budget", "Roll Over Budget", "Actual", "%"].forEach((name, offset) => {
      sheet.getCell(3, column + offset).value = name;
    });
  });
  build(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addBudgetRow(
  sheet: Worksheet,
  values: { aprilBudget: CellValue; aprilRollover: CellValue; mayBudget: CellValue; mayRollover: CellValue },
): void {
  sheet.getCell(5, 1).value = "1.1";
  sheet.getCell(5, 2).value = "Imported Sprouts";
  sheet.getCell(5, 6).value = "50001201";
  sheet.getCell(5, 7).value = values.aprilBudget;
  sheet.getCell(5, 8).value = values.aprilRollover;
  sheet.getCell(5, 11).value = values.mayBudget;
  sheet.getCell(5, 12).value = values.mayRollover;
}

function sapRow({
  rowNumber,
  transactionNumber,
  lineId,
  date = new Date("2026-07-15T00:00:00Z"),
  month = "Jul",
  debit = 100,
  credit = 25,
}: {
  rowNumber: number;
  transactionNumber: string;
  lineId: string;
  date?: Date;
  month?: string;
  debit?: string | number;
  credit?: string | number;
}): CellValue[] {
  return [
    rowNumber,
    transactionNumber,
    lineId,
    date,
    month,
    "DUB-NUR",
    "CC-1",
    "50001701",
    "Account name",
    debit,
    credit,
    "Short account",
    "CONTRA",
    "Line memo",
    "First comment",
    "Second comment",
    "SAP",
    "REF-1",
    "Nursery",
  ];
}
