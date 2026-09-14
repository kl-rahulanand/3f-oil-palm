import { z } from "zod";
import {
  ASK_PRIOR_TURN_MAX_QUESTION_CHARS,
  ASK_PRIOR_TURNS_MAX_ENTRIES,
  ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS,
} from "@3f/contract";
import { selectionSchema } from "../saved/saved.schemas";
import { LLM_CONTEXT_CHAR_BUDGET } from "../llm/llm.constants";
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

const priorTurnsSchema = z
  .array(
    z
      .object({
        question: z.string().min(1).max(ASK_PRIOR_TURN_MAX_QUESTION_CHARS),
        selection: selectionSchema,
      })
      .strict(),
  )
  .max(ASK_PRIOR_TURNS_MAX_ENTRIES)
  .refine((priorTurns) => JSON.stringify(priorTurns).length <= ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS, {
    message: "priorTurns payload is too large",
  });

export const askSchema = z
  .object({
    question: z.string().min(CHAT_VALIDATION.questionMinLength).max(LLM_CONTEXT_CHAR_BUDGET),
    sessionId: z.string().min(1).max(200).optional(),
    selection: selectionSchema.optional(),
    priorTurns: priorTurnsSchema.optional(),
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
