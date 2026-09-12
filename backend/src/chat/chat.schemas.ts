import { z } from "zod";
import { selectionSchema } from "../saved/saved.schemas";
import { CHAT_VALIDATION } from "./chat.constants";

const reportGroundingTimeWindowSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    column: z.string().min(1).max(64).optional(),
  })
  .refine((timeWindow) => timeWindow.from <= timeWindow.to, {
    message: "from must be on or before to",
  });

export const askSchema = z
  .object({
    question: z.string().min(CHAT_VALIDATION.questionMinLength),
    sessionId: z.string().min(1).max(200).optional(),
    selection: selectionSchema.optional(),
    priorTurns: z.array(z.object({ question: z.string().min(1), selection: selectionSchema }).strict()).optional(),
    reportGrounding: z
      .object({
        reportId: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9-]+$/, "Report id must contain only lowercase letters, numbers, and hyphens"),
        timeWindow: reportGroundingTimeWindowSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
