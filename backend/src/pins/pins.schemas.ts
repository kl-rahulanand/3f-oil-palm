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
