import { z } from "zod";

const filterSchema = z.object({
  fieldId: z.string().min(1).max(80),
  operator: z.enum(["eq", "neq", "in", "is_not_null"]),
  values: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).strict();

export const authoredMeasureInputSchema = z.object({
  domain: z.string().min(1).max(80),
  key: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
  label: z.string().trim().min(2).max(100),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  baseField: z.string().min(1).max(80),
  aggregation: z.enum(["count", "count_distinct", "sum", "average", "minimum", "maximum"]),
  timeDimension: z.string().min(1).max(80).optional(),
  timeGrain: z.enum(["day", "week", "month"]).optional(),
  filters: z.array(filterSchema).max(10).default([]),
  format: z.enum(["number", "percent"]).default("number"),
}).strict().superRefine((value, context) => {
  if (Boolean(value.timeDimension) !== Boolean(value.timeGrain)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Time dimension and grain must be set together" });
  }
  for (const [index, filter] of value.filters.entries()) {
    if (filter.operator !== "is_not_null" && filter.values.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["filters", index, "values"], message: "Filter value is required" });
    }
  }
});

export type AuthoredMeasureInputValue = z.infer<typeof authoredMeasureInputSchema>;
