import { ApiProperty } from "@nestjs/swagger";
import type { IngestActualsResponse, IngestBudgetResponse } from "@3f/contract";
import { z } from "zod";

export const MAX_ACTUALS_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_ACTUALS_ROWS = 25_000;

export const ingestActualsResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    period: z.string().regex(/^\d{4}-\d{2}-01$/),
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

export const ingestBudgetResponseSchema = z
  .object({
    formatId: z.string().min(1),
    plant: z.string().min(1),
    periods: z.array(
      z
        .object({
          period: z.string().regex(/^\d{4}-\d{2}-01$/),
          batchId: z.string().uuid(),
          rowCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    totalRowCount: z.number().int().nonnegative(),
  })
  .strict();

export class IngestActualsMultipartDto {
  @ApiProperty({
    type: "string",
    format: "binary",
    description: "One SAP Base Report workbook in .xlsx format (maximum 15 MB).",
  })
  file!: string;
}

export class IngestBudgetMultipartDto {
  @ApiProperty({
    type: "string",
    format: "binary",
    description: "One Nursery MIS Format workbook in .xlsx format (maximum 15 MB).",
  })
  file!: string;
}

export class IngestActualsResponseDto implements IngestActualsResponse {
  @ApiProperty({ example: "ed401db9-ab53-4543-8da3-77e8aac62c59" })
  batchId!: string;

  @ApiProperty({ example: "2026-07-01" })
  period!: string;

  @ApiProperty({ example: 4113 })
  rowCount!: number;
}

class IngestBudgetPeriodResponseDto {
  @ApiProperty({ example: "2026-07-01" })
  period!: string;

  @ApiProperty({ example: "ed401db9-ab53-4543-8da3-77e8aac62c59" })
  batchId!: string;

  @ApiProperty({ example: 87 })
  rowCount!: number;
}

export class IngestBudgetResponseDto implements IngestBudgetResponse {
  @ApiProperty({ example: "nursery-mis-financial-v1" })
  formatId!: string;

  @ApiProperty({ example: "DUB" })
  plant!: string;

  @ApiProperty({ type: [IngestBudgetPeriodResponseDto] })
  periods!: IngestBudgetPeriodResponseDto[];

  @ApiProperty({ example: 1044 })
  totalRowCount!: number;
}

export class IngestActualsErrorDto {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ type: "object", example: null, nullable: true })
  data: null = null;

  @ApiProperty({
    type: "object",
    example: {
      code: "VALIDATION_ERROR",
      details: { fieldErrors: [{ field: "rows.4.debit", reason: "invalid" }] },
      statusCode: 400,
    },
  })
  error!: Record<string, unknown>;
}
