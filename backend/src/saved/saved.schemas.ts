import { z } from "zod";

const chartTypeSchema = z.enum(["kpi", "line", "bar", "pie", "table"]);

const selectionSchema = z.object({
  domain: z.string().min(1),
  measureIds: z.array(z.string().min(1)).min(1),
  dimensionIds: z.array(z.string()),
  filters: z.array(
    z.object({
      dimensionId: z.string().min(1),
      op: z.enum(["eq", "in", "neq"]),
      value: z.union([z.string(), z.array(z.string())]),
    }),
  ),
  timeWindow: z
    .object({
      grain: z.enum(["day", "week", "month"]),
      last: z.number().int().positive().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      column: z.string().optional(),
    })
    .optional(),
  limit: z.number().int().positive().optional(),
});

export const saveQuerySchema = z
  .object({
    selection: selectionSchema,
    chartType: chartTypeSchema.optional(),
  })
  .strict();

export { selectionSchema, chartTypeSchema };
