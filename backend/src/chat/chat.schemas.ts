import { z } from "zod";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ASK_PRIOR_TURN_MAX_QUESTION_CHARS,
  ASK_PRIOR_TURNS_MAX_ENTRIES,
  ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS,
  ResponseClass,
  type AskResponse,
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

const statementGroundingSchema = z
  .object({
    attestedContext: z.string().min(3),
    department: z.string().min(1),
    function: z.string().min(1),
    focus: z
      .object({
        nodeKey: z.string().min(1).max(200),
        block: z.enum(["selected", "fy26-27-ytd"]),
        subject: z.enum(["actual", "budget"]),
      })
      .strict()
      .optional(),
    nodeMetadata: z
      .array(
        z
          .object({
            nodeKey: z.string().min(1).max(200),
            glCodes: z.array(z.string().min(1).max(100)).max(100),
            costCentres: z.array(z.string().min(1).max(200)).max(100),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

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
    statementGrounding: statementGroundingSchema.optional(),
  })
  .strict();

export class ChatResponseDto {
  @ApiProperty({ enum: Object.values(ResponseClass) })
  responseClass!: ResponseClass;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({
    required: false,
    oneOf: [
      { type: "object", required: ["outcome"], properties: { outcome: { enum: ["focus-required"] } } },
      {
        type: "object",
        required: ["outcome", "transactions", "rollup"],
        properties: {
          outcome: { enum: ["leaf"] },
          transactions: { type: "object" },
          rollup: { type: "array", items: { type: "object" } },
        },
      },
      {
        type: "object",
        required: ["outcome", "transactions", "rollup", "notice"],
        properties: {
          outcome: { enum: ["replaced"] },
          transactions: { type: "object" },
          rollup: { type: "array", items: { type: "object" } },
          notice: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["outcome", "instruction"],
        properties: {
          outcome: { enum: ["aggregate"] },
          instruction: { enum: ["project-descendants-from-attested-statement"] },
        },
      },
      {
        type: "object",
        required: ["outcome", "batchStatuses"],
        properties: { outcome: { enum: ["gone"] }, batchStatuses: { type: "array", items: { type: "object" } } },
      },
      {
        type: "object",
        required: ["outcome", "message"],
        properties: { outcome: { enum: ["audit-failure"] }, message: { type: "string" } },
      },
      {
        type: "object",
        required: ["outcome", "reason"],
        properties: { outcome: { enum: ["refused"] }, reason: { type: "string" } },
      },
    ],
  })
  statementGrounding?: AskResponse["statementGrounding"];

  @ApiProperty({ type: Object })
  viewInReport!: AskResponse["viewInReport"];

  @ApiPropertyOptional()
  message?: string;
}

export class ChatStreamEventDto {
  @ApiProperty({ enum: ["phase", "token", "result", "error"] })
  type!: "phase" | "token" | "result" | "error";

  @ApiPropertyOptional({ type: ChatResponseDto })
  response?: ChatResponseDto;
}
