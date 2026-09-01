import { z } from "zod";

const titleSchema = z.string().trim().min(1).max(120);

export const createConversationSchema = z
  .object({
    title: titleSchema.optional(),
  })
  .strict();

export const renameConversationSchema = z
  .object({
    title: titleSchema,
  })
  .strict();
