import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import type { IngestActualsResponse, IngestBudgetResponse } from "@3f/contract";
import { z } from "zod";
import { StructuredLogger } from "../common/structured.logger";
import { loadConfig } from "../config";
import {
  createWarehouseDb,
  createWarehouseWritePool,
  IngestionRepository,
  type CandidateBatchMetadata,
  type IIngestionRepository,
  type SapTransactionInput,
} from "../warehouse/ingestion.repository";
import { ingestActualsResponseSchema, ingestBudgetResponseSchema, MAX_ACTUALS_UPLOAD_BYTES } from "./ingest.schemas";
import { parseMisBudgetWorkbook, type ParsedMisBudget } from "./mis-budget.parser";
import { parseSapActualsWorkbook, type ParsedSapActuals } from "./sap-actuals.parser";
import { WorkbookArchiveLimitError, WorkbookRowLimitError } from "./workbook-guard";

export interface UploadedWorkbook {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class IngestService {
  private readonly logger = new StructuredLogger(loadConfig());

  async ingestActuals(file: UploadedWorkbook | undefined, uploadedBy: string): Promise<IngestActualsResponse> {
    validateFile(file);
    const parsed = await withUploadLimitErrors(this.parseWorkbook(file.buffer));
    const periods = await this.withActualsRepository(async (repository) => {
      const results: IngestActualsResponse["periods"] = [];
      for (const current of parsed.periods) {
        const rows = current.rows.map(({ actual: _actual, ...row }) => row);
        const batchId = await repository.replaceActualsBatch(
          {
            period: current.period,
            uploadedBy,
            validationResult: {
              ...parsed.validationResult,
              period: current.period,
              periodRowCount: rows.length,
            },
            reconciliationResult: {},
          },
          rows,
        );
        results.push({ period: current.period, batchId, rowCount: rows.length });
      }
      return results;
    });
    const response = ingestActualsResponseSchema.parse({
      periods,
      totalRowCount: parsed.totalRowCount,
      skippedRowCount: parsed.skippedRowCount,
    });

    this.logger.log("info", "SAP actuals batch ingested", {
      module: "Ingest",
      accountId: uploadedBy,
      context: {
        periodCount: periods.length,
        rowCount: parsed.totalRowCount,
        skippedRowCount: parsed.skippedRowCount,
      },
    });
    return response;
  }

  async ingestBudget(file: UploadedWorkbook | undefined, uploadedBy: string): Promise<IngestBudgetResponse> {
    validateFile(file);
    const parsed = await withUploadLimitErrors(this.parseBudgetWorkbook(file.buffer));
    const periods = await this.withBudgetRepository(async (repository) => {
      const results: IngestBudgetResponse["periods"] = [];
      for (const current of parsed.periods) {
        const batchId = await repository.replaceBudgetBatch(
          {
            period: current.period,
            uploadedBy,
            validationResult: {
              ...parsed.validationResult,
              period: current.period,
              periodRowCount: current.rows.length,
            },
            reconciliationResult: {},
          },
          current.rows,
          parsed.outline,
        );
        results.push({ period: current.period, batchId, rowCount: current.rows.length });
      }
      return results;
    });
    const response = ingestBudgetResponseSchema.parse({
      formatId: parsed.formatId,
      plant: parsed.plant,
      periods,
      totalRowCount: parsed.totalRowCount,
    });

    this.logger.log("info", "MIS budget batches ingested", {
      module: "Ingest",
      accountId: uploadedBy,
      context: {
        formatId: parsed.formatId,
        plant: parsed.plant,
        periodCount: periods.length,
        rowCount: parsed.totalRowCount,
      },
    });
    return response;
  }

  protected parseWorkbook(buffer: Buffer): Promise<ParsedSapActuals> {
    return parseSapActualsWorkbook(buffer);
  }

  protected parseBudgetWorkbook(buffer: Buffer): Promise<ParsedMisBudget> {
    return parseMisBudgetWorkbook(buffer);
  }

  protected async withActualsRepository<T>(run: (repository: IIngestionRepository) => Promise<T>): Promise<T> {
    const pool = await createWarehouseWritePool();
    try {
      return await createWarehouseDb(pool).transaction((transaction) => run(new IngestionRepository(transaction)));
    } finally {
      await pool.end();
    }
  }

  protected async withBudgetRepository<T>(run: (repository: IIngestionRepository) => Promise<T>): Promise<T> {
    const pool = await createWarehouseWritePool();
    try {
      return await createWarehouseDb(pool).transaction((transaction) => run(new IngestionRepository(transaction)));
    } finally {
      await pool.end();
    }
  }
}

async function withUploadLimitErrors<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof WorkbookRowLimitError || error instanceof WorkbookArchiveLimitError) {
      throw new PayloadTooLargeException(error.message);
    }
    throw error;
  }
}

function validateFile(file: UploadedWorkbook | undefined): asserts file is UploadedWorkbook {
  if (!file) {
    throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ["file"], message: "One .xlsx workbook is required" }]);
  }
  if (file.size > MAX_ACTUALS_UPLOAD_BYTES || file.buffer.length > MAX_ACTUALS_UPLOAD_BYTES) {
    throw new PayloadTooLargeException("Workbook exceeds the upload byte limit");
  }
  if (
    file.mimetype !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    !file.originalname.toLowerCase().endsWith(".xlsx") ||
    !file.buffer.subarray(0, 2).equals(Buffer.from("PK"))
  ) {
    throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ["file"], message: "One .xlsx workbook is required" }]);
  }
}
