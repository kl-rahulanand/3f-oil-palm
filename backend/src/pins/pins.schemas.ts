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
import { chartTypeSchema, selectionSchema } from "../saved/saved.schemas";

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

export class CreatePinRequestDto implements CreatePinRequest {
  @ApiProperty({ required: false, maxLength: 120, example: "Monthly actuals" })
  title?: string;

  @ApiProperty({ type: "object", description: "Governed semantic selection to pin." })
  selection!: Selection;

  @ApiProperty({ enum: ["kpi", "line", "bar", "pie", "table"], required: false })
  chartType?: ChartType;

  @ApiProperty({ type: "object", required: false })
  view?: ChartView;
}

export class UpdatePinViewRequestDto implements UpdatePinViewRequest {
  @ApiProperty({ type: "object" })
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

  @ApiProperty({ type: "object", required: false })
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
