import { ApiProperty } from "@nestjs/swagger";
import type {
  ChartType,
  Environment,
  ErrorEnvelope,
  ErrorFieldDetail,
  ErrorPayload,
  ExplorationSelectionStatus,
  SaveQueryRequest,
  SavedQuery,
  Selection,
  SelectionFilter,
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

class ExplorationSelectionFilterDto implements SelectionFilter {
  @ApiProperty({ example: "month" })
  dimensionId!: string;

  @ApiProperty({ enum: ["eq", "in", "neq"], example: "eq" })
  op!: SelectionFilter["op"];

  @ApiProperty({ oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }], example: "2026-07" })
  value!: string | string[];
}

class ExplorationTimeWindowDto implements NonNullable<Selection["timeWindow"]> {
  @ApiProperty({ enum: ["day", "week", "month"], example: "month" })
  grain!: NonNullable<Selection["timeWindow"]>["grain"];

  @ApiProperty({ required: false, minimum: 1, example: 12 })
  last?: number;

  @ApiProperty({ required: false, example: "2026-04-01" })
  from?: string;

  @ApiProperty({ required: false, example: "2027-03-31" })
  to?: string;

  @ApiProperty({ required: false, example: "month" })
  column?: string;
}

export class ExplorationSelectionDto implements Selection {
  @ApiProperty({ example: "governed-financial" })
  domain!: string;

  @ApiProperty({ type: [String], example: ["governed-financial.actual"] })
  measureIds!: string[];

  @ApiProperty({ type: [String], example: ["month"] })
  dimensionIds!: string[];

  @ApiProperty({ type: [ExplorationSelectionFilterDto] })
  filters!: SelectionFilter[];

  @ApiProperty({ type: ExplorationTimeWindowDto, required: false })
  timeWindow?: NonNullable<Selection["timeWindow"]>;

  @ApiProperty({ required: false, minimum: 1, example: 100 })
  limit?: number;
}

export class SaveQueryRequestDto implements SaveQueryRequest {
  @ApiProperty({ type: ExplorationSelectionDto, description: "Governed semantic selection to save." })
  selection!: Selection;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false, example: "bar" })
  chartType?: ChartType;
}

export class SavedQueryResponseDto implements SavedQuery {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: ExplorationSelectionDto })
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

class ExplorationErrorFieldDto implements ErrorFieldDetail {
  @ApiProperty({ example: "selection.domain" })
  field!: string;

  @ApiProperty({ example: "invalid" })
  reason!: string;
}

class ExplorationErrorDetailsDto {
  @ApiProperty({ type: [ExplorationErrorFieldDto], required: false })
  fieldErrors?: ExplorationErrorFieldDto[];
}

class ExplorationErrorPayloadDto implements ErrorPayload {
  @ApiProperty({ format: "uuid" })
  errorId!: string;

  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ example: "ValidationError" })
  type!: string;

  @ApiProperty({ example: "HTTP exception" })
  message!: string;

  @ApiProperty({ example: "The request contains invalid fields" })
  userMessage!: string;

  @ApiProperty({ type: ExplorationErrorDetailsDto })
  details!: ExplorationErrorDetailsDto;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ format: "uuid" })
  correlationId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  requestId!: string | null;

  @ApiProperty({ enum: ["Local", "Development", "QA", "UAT", "Staging", "Production"] })
  environment!: Environment;

  @ApiProperty({ format: "date-time" })
  timestampUtc!: string;

  @ApiProperty({ required: false })
  stack?: string;
}

export class ExplorationErrorDto implements ErrorEnvelope {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ type: "object", example: null, nullable: true })
  data: null = null;

  @ApiProperty({ type: ExplorationErrorPayloadDto })
  error!: ExplorationErrorPayloadDto;
}
