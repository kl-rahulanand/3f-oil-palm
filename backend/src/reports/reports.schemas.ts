import { z } from "zod";

export const reportIdParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Report id must contain only lowercase letters, numbers, and hyphens");

export const runReportBodySchema = z.object({
  timeWindow: z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      column: z.string().min(1).max(64).optional(),
    })
    .refine((timeWindow) => timeWindow.from <= timeWindow.to, {
      message: "from must be on or before to",
    })
    .optional(),
});
