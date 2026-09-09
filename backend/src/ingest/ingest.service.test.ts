import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { Workbook, type CellValue } from "exceljs";
import { z } from "zod";
import {
  createWarehouseWritePool,
  type CandidateBatchMetadata,
  type SapTransactionInput,
} from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import { MAX_ACTUALS_UPLOAD_BYTES } from "./ingest.schemas";
import { IngestService, type UploadedWorkbook } from "./ingest.service";
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

function asUpload(buffer: Buffer): UploadedWorkbook {
  return {
    originalname: "actuals.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
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
