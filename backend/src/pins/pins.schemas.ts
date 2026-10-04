import { ApiProperty } from "@nestjs/swagger";
import type {
  ChartType,
  ChartView,
  CreatePinRequest,
  ExplorationSelectionStatus,
  Pin,
  ReorderPinsRequest,
  Selection,
  UpdatePinViewRequest,
} from "@3f/contract";
import { z } from "zod";
import { ExplorationSelectionDto, chartTypeSchema, selectionSchema } from "../saved/saved.schemas";

const pinStatusReasonSchema = z.enum(["grant_revoked", "definition_unregistered", "plants_revoked"]);

export const pinStatusSchema = z.union([
  z.object({ runnable: z.literal(true) }).strict(),
  z
    .object({
      runnable: z.literal(false),
      reason: pinStatusReasonSchema,
      message: z.string(),
    })
    .strict(),
]) satisfies z.ZodType<ExplorationSelectionStatus>;

export const chartViewSchema = z
  .object({
    chartType: chartTypeSchema.optional(),
    axisSwapped: z.boolean().optional(),
    sort: z
      .object({
        key: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const createPinSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    selection: selectionSchema,
    chartType: chartTypeSchema.optional(),
    view: chartViewSchema.optional(),
  })
  .strict();

export const updatePinViewSchema = z
  .object({
    view: chartViewSchema,
  })
  .strict();

export const reorderPinsSchema = z
  .object({
    orderedIds: z.array(z.string().uuid()).nonempty(),
  })
  .strict();

class PinSortDto implements NonNullable<ChartView["sort"]> {
  @ApiProperty({ example: "month" })
  key!: string;

  @ApiProperty({ enum: ["asc", "desc"], example: "asc" })
  direction!: "asc" | "desc";
}

class ChartViewDto implements ChartView {
  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false })
  chartType?: ChartType;

  @ApiProperty({ required: false, example: false })
  axisSwapped?: boolean;

  @ApiProperty({ type: PinSortDto, required: false, nullable: true })
  sort?: PinSortDto | null;
}

export class CreatePinRequestDto implements CreatePinRequest {
  @ApiProperty({ required: false, maxLength: 120, example: "Monthly actuals" })
  title?: string;

  @ApiProperty({ type: ExplorationSelectionDto, description: "Governed semantic selection to pin." })
  selection!: Selection;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false })
  chartType?: ChartType;

  @ApiProperty({ type: ChartViewDto, required: false })
  view?: ChartView;
}

export class UpdatePinViewRequestDto implements UpdatePinViewRequest {
  @ApiProperty({ type: ChartViewDto })
  view!: ChartView;
}

export class ReorderPinsRequestDto implements ReorderPinsRequest {
  @ApiProperty({ type: [String], format: "uuid" })
  orderedIds!: string[];
}

export class PinResponseDto implements Pin {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Monthly actuals" })
  title!: string;

  @ApiProperty({ type: ExplorationSelectionDto })
  selection!: Selection;

  @ApiProperty({
    oneOf: [
      { type: "object", properties: { runnable: { type: "boolean", enum: [true] } }, required: ["runnable"] },
      {
        type: "object",
        properties: {
          runnable: { type: "boolean", enum: [false] },
          reason: { type: "string", enum: pinStatusReasonSchema.options },
          message: { type: "string" },
        },
        required: ["runnable", "reason", "message"],
      },
    ],
  })
  status!: ExplorationSelectionStatus;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false })
  chartType?: ChartType;

  @ApiProperty({ type: ChartViewDto, required: false })
  view?: ChartView;

  @ApiProperty()
  definitionVersion!: string;

  @ApiProperty()
  definitionChanged!: boolean;

  @ApiProperty()
  position!: number;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
