import { z } from "zod";

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO date string",
});

export const usageQuerySchema = z
  .object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  })
  .strict();

export type UsageQuery = z.infer<typeof usageQuerySchema>;

export const usageSeriesQuerySchema = usageQuerySchema.extend({
  userId: z.string().uuid().optional(),
});

export type UsageSeriesQuery = z.infer<typeof usageSeriesQuerySchema>;
