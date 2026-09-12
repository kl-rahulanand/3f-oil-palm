import { ApiProperty } from "@nestjs/swagger";
import type {
  ChartType,
  ErrorEnvelope,
  ExplorationSelectionStatus,
  SaveQueryRequest,
  SavedQuery,
  Selection,
} from "@3f/contract";
import { z } from "zod";

const chartTypeSchema = z.enum(["kpi", "line", "bar", "pie", "table"]);

const selectionSchema = z
  .object({
    domain: z.string().min(1),
    measureIds: z.array(z.string().min(1)).min(1),
    dimensionIds: z.array(z.string()),
    filters: z.array(
      z
        .object({
          dimensionId: z.string().min(1),
          op: z.enum(["eq", "in", "neq"]),
          value: z.union([z.string(), z.array(z.string())]),
        })
        .strict(),
    ),
    timeWindow: z
      .object({
        grain: z.enum(["day", "week", "month"]),
        last: z.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        column: z.string().optional(),
      })
      .strict()
      .optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();

export const saveQuerySchema = z
  .object({
    selection: selectionSchema,
    chartType: chartTypeSchema.optional(),
  })
  .strict();

export { selectionSchema, chartTypeSchema };

export class SaveQueryRequestDto implements SaveQueryRequest {
  @ApiProperty({ type: "object", description: "Governed semantic selection to save." })
  selection!: Selection;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false, example: "bar" })
  chartType?: ChartType;
}

export class SavedQueryResponseDto implements SavedQuery {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: "object" })
  selection!: Selection;

  @ApiProperty({
    oneOf: [
      { type: "object", properties: { runnable: { type: "boolean", enum: [true] } }, required: ["runnable"] },
      {
        type: "object",
        properties: {
          runnable: { type: "boolean", enum: [false] },
          reason: { type: "string", enum: ["grant_revoked", "definition_unregistered"] },
          message: { type: "string" },
        },
        required: ["runnable", "reason", "message"],
      },
    ],
  })
  status!: ExplorationSelectionStatus;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false })
  chartType?: ChartType;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class ExplorationDeleteResponseDto {
  @ApiProperty({ example: true })
  ok: true = true;
}

export class ExplorationErrorDto implements ErrorEnvelope {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ type: "object", example: null, nullable: true })
  data: null = null;

  @ApiProperty({ type: "object" })
  error!: ErrorEnvelope["error"];
}
