import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import type { IngestActualsResponse } from "@3f/contract";
import { z } from "zod";
import { StructuredLogger } from "../common/structured.logger";
import { loadConfig } from "../config";
import {
  createWarehouseDb,
  createWarehouseWritePool,
  IngestionRepository,
  type CandidateBatchMetadata,
  type SapTransactionInput,
} from "../warehouse/ingestion.repository";
import { ingestActualsResponseSchema, MAX_ACTUALS_UPLOAD_BYTES } from "./ingest.schemas";
import {
  parseSapActualsWorkbook,
  type ParsedSapActuals,
  SapActualsArchiveLimitError,
  SapActualsRowLimitError,
} from "./sap-actuals.parser";

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
    const parsed = await this.parseWorkbook(file.buffer).catch((error: unknown) => {
      if (error instanceof SapActualsRowLimitError || error instanceof SapActualsArchiveLimitError) {
        throw new PayloadTooLargeException(error.message);
      }
      throw error;
    });
    const metadata: CandidateBatchMetadata = {
      period: parsed.period,
      uploadedBy,
      validationResult: parsed.validationResult,
      reconciliationResult: {},
    };
    const rows = parsed.rows.map(({ actual: _actual, ...row }) => row);
    const batchId = await this.replaceActualsBatch(metadata, rows);
    const response = ingestActualsResponseSchema.parse({
      batchId,
      period: parsed.period,
      rowCount: rows.length,
    });

    this.logger.log("info", "SAP actuals batch ingested", {
      module: "Ingest",
      accountId: uploadedBy,
      context: { batchId, period: parsed.period, rowCount: rows.length },
    });
    return response;
  }

  protected parseWorkbook(buffer: Buffer): Promise<ParsedSapActuals> {
    return parseSapActualsWorkbook(buffer);
  }

  protected async replaceActualsBatch(metadata: CandidateBatchMetadata, rows: SapTransactionInput[]): Promise<string> {
    const pool = await createWarehouseWritePool();
    try {
      return await new IngestionRepository(createWarehouseDb(pool)).replaceActualsBatch(metadata, rows);
    } finally {
      await pool.end();
    }
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
