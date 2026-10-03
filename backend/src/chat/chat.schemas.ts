import { z } from "zod";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ASK_PRIOR_TURN_MAX_QUESTION_CHARS,
  ASK_PRIOR_TURNS_MAX_ENTRIES,
  ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS,
  ResponseClass,
  type AskDrillMetadata,
  type AskDrillRequest,
  type AskDrillResponse,
  type AskRowLabel,
  type FixedScaleMoney,
  type MisDrillBatchStatus,
  type MisDrillFooter,
  type MisDrillLine,
  type AskResponse,
} from "@3f/contract";
import { ExplorationSelectionDto, selectionSchema } from "../saved/saved.schemas";
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

const askSelectionSchema = selectionSchema;

const priorTurnsSchema = z
  .array(
    z
      .object({
        question: z.string().min(1).max(ASK_PRIOR_TURN_MAX_QUESTION_CHARS),
        selection: askSelectionSchema,
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
    nodeAmounts: z
      .array(
        z
          .object({
            nodeKey: z.string().min(1).max(200),
            block: z.enum(["selected", "fy26-27-ytd"]),
            actualPaise: z.string().regex(/^-?\d{1,30}$/),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();

export const askSchema = z
  .object({
    question: z.string().min(CHAT_VALIDATION.questionMinLength).max(LLM_CONTEXT_CHAR_BUDGET),
    sessionId: z.string().min(1).max(200).optional(),
    selection: askSelectionSchema.optional(),
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

export const askDrillSchema = z
  .object({
    context: z.string().min(3),
    rowKey: z.string().trim().min(1).max(200),
    page: z.number().int().min(1).max(1_000_000),
  })
  .strict();

export class AskDrillRequestDto implements AskDrillRequest {
  @ApiProperty({ description: "Opaque context signed with the Ask answer.", example: "eyJ...signature" })
  context!: string;
  @ApiProperty({ description: "Raw result row key.", example: "50001201" })
  rowKey!: string;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 1_000_000, example: 1 })
  page!: number;
}

class AskDrillLineDto implements MisDrillLine {
  @ApiProperty({ example: "2026-07-01" }) month!: string;
  @ApiProperty({ example: "2026-07-14" }) postingDate!: string;
  @ApiProperty({ example: "1900001234" }) txnNo!: string;
  @ApiProperty({ example: "DUB-NUR" }) costCenter!: string;
  @ApiProperty({ example: "Sprout Cost - Imp" }) accountName!: string;
  @ApiProperty({ example: "125.00" }) debit!: FixedScaleMoney;
  @ApiProperty({ example: "0.00" }) credit!: FixedScaleMoney;
  @ApiProperty({ example: "125.00" }) value!: FixedScaleMoney;
  @ApiProperty({ nullable: true }) reference!: string | null;
  @ApiProperty({ nullable: true }) memo!: string | null;
}

class AskDrillFooterDto implements MisDrillFooter {
  @ApiProperty({ example: "125.00" }) debit!: FixedScaleMoney;
  @ApiProperty({ example: "0.00" }) credit!: FixedScaleMoney;
  @ApiProperty({ example: "125.00" }) value!: FixedScaleMoney;
}

class AskDrillBatchStatusDto implements MisDrillBatchStatus {
  @ApiProperty({ enum: ["actuals", "budget"] }) source!: "actuals" | "budget";
  @ApiProperty({ example: "2026-07-01" }) period!: string;
  @ApiProperty({ format: "uuid" }) requestedBatchId!: string;
  @ApiProperty({ enum: ["current", "replaced", "gone"] }) status!: "current" | "replaced" | "gone";
  @ApiProperty({ format: "uuid", nullable: true }) activeBatchId!: string | null;
}

export class AskDrillResponseDto implements AskDrillResponse {
  @ApiProperty() rowKey!: string;
  @ApiProperty({ type: [AskDrillLineDto] }) lines!: MisDrillLine[];
  @ApiProperty({ type: AskDrillFooterDto }) footer!: MisDrillFooter;
  @ApiProperty({ type: "integer" }) totalCount!: number;
  @ApiProperty({ type: "integer" }) page!: number;
  @ApiProperty({ type: "integer", enum: [100] }) pageSize: 100 = 100;
  @ApiProperty({ type: [AskDrillBatchStatusDto] }) batchStatuses!: MisDrillBatchStatus[];
  @ApiPropertyOptional() notice?: string;
}

class AskRowLabelDto implements AskRowLabel {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [String] }) otherLabels!: string[];
}

type AskDrillMetadataRow = AskDrillMetadata["rows"][number];

class AskDrillMetadataRowDto implements AskDrillMetadataRow {
  @ApiProperty() key!: string;
  @ApiProperty() drillable!: boolean;
}

class AskDrillMetadataDto implements AskDrillMetadata {
  @ApiProperty() context!: string;
  @ApiProperty({ type: [AskDrillMetadataRowDto] }) rows!: AskDrillMetadata["rows"];
}

export class ChatResponseDto {
  @ApiProperty({ enum: Object.values(ResponseClass) })
  responseClass!: ResponseClass;

  @ApiProperty()
  sessionId!: string;

  @ApiPropertyOptional({ enum: ["informational"] })
  kind?: AskResponse["kind"];

  @ApiPropertyOptional()
  term?: string;

  @ApiPropertyOptional({ enum: ["measure", "dimension", "value", "meta"] })
  definitionKind?: AskResponse["definitionKind"];

  @ApiPropertyOptional()
  definition?: string;

  @ApiPropertyOptional({ type: [String] })
  suggestedQuestions?: string[];

  @ApiPropertyOptional()
  usedPriorContext?: boolean;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional({
    type: "array",
    items: {
      type: "object",
      required: ["kind", "id", "label"],
      properties: {
        kind: { enum: ["measure", "dimension", "filter", "timeWindow"] },
        id: { type: "string" },
        label: { type: "string" },
      },
    },
  })
  chips?: AskResponse["chips"];

  @ApiPropertyOptional({ type: ExplorationSelectionDto })
  selection?: AskResponse["selection"];

  @ApiPropertyOptional({
    oneOf: [
      {
        type: "object",
        required: ["columns", "rows"],
        properties: {
          columns: { type: "array", items: { type: "object" } },
          rows: { type: "array", items: { type: "object", additionalProperties: true } },
          suppressedCells: { type: "array", items: { type: "object" } },
        },
      },
    ],
  })
  result?: AskResponse["result"];

  @ApiPropertyOptional({ type: [AskRowLabelDto] })
  rowLabels?: AskResponse["rowLabels"];

  @ApiPropertyOptional({ type: AskDrillMetadataDto })
  drill?: AskResponse["drill"];

  @ApiPropertyOptional({ type: "object", additionalProperties: { type: "number" } })
  totals?: AskResponse["totals"];

  @ApiPropertyOptional({ enum: ["kpi", "line", "bar", "pie", "table"] })
  chartType?: AskResponse["chartType"];

  @ApiPropertyOptional({ type: "array", items: { enum: ["kpi", "line", "bar", "pie", "table"] } })
  availableChartTypes?: AskResponse["availableChartTypes"];

  @ApiPropertyOptional({ type: "object" })
  availableFields?: AskResponse["availableFields"];

  @ApiPropertyOptional({ type: "object" })
  provenance?: AskResponse["provenance"];

  @ApiPropertyOptional({
    oneOf: [
      {
        type: "object",
        required: ["from", "to", "column"],
        properties: { from: { type: "string" }, to: { type: "string" }, column: { type: "string" } },
      },
    ],
  })
  appliedTimeWindow?: AskResponse["appliedTimeWindow"];

  @ApiPropertyOptional({ type: "array", items: { type: "object" } })
  appliedFilters?: AskResponse["appliedFilters"];

  @ApiPropertyOptional({
    type: "array",
    items: {
      type: "object",
      required: ["measureId", "op", "compareTo"],
      properties: {
        measureId: { type: "string", example: "governed-financial.actual" },
        op: { enum: ["gt", "gte", "lt", "lte"], example: "gt" },
        compareTo: {
          oneOf: [
            {
              type: "object",
              required: ["kind", "measureId"],
              properties: {
                kind: { enum: ["measure"] },
                measureId: { type: "string", example: "governed-financial.budget" },
              },
            },
            {
              type: "object",
              required: ["kind", "value"],
              properties: {
                kind: { enum: ["value"] },
                value: { type: "string", example: "500000.00" },
              },
            },
          ],
        },
      },
    },
  })
  appliedMeasureFilters?: AskResponse["appliedMeasureFilters"];

  @ApiPropertyOptional({ type: "object" })
  periodChoice?: AskResponse["periodChoice"];

  @ApiPropertyOptional({ type: "object" })
  periodControl?: AskResponse["periodControl"];

  @ApiProperty({
    required: false,
    oneOf: [
      { type: "object", required: ["outcome"], properties: { outcome: { enum: ["focus-required"] } } },
      {
        type: "object",
        required: ["outcome", "nodeKey", "leafKey", "block", "budgetState", "transactions", "rollup"],
        properties: {
          outcome: { enum: ["leaf"] },
          ...leafExplanationProperties(),
        },
      },
      {
        type: "object",
        required: [
          "outcome",
          "nodeKey",
          "leafKey",
          "block",
          "budgetState",
          "transactions",
          "rollup",
          "notice",
          "replacedBatches",
        ],
        properties: {
          outcome: { enum: ["replaced"] },
          ...leafExplanationProperties(),
          notice: { type: "string" },
          replacedBatches: batchStatusesSchema(),
        },
      },
      {
        type: "object",
        required: ["outcome", "nodeKey", "block", "budgetState", "instruction"],
        properties: {
          outcome: { enum: ["aggregate"] },
          nodeKey: { type: "string" },
          block: { enum: ["selected", "fy26-27-ytd"] },
          budgetState: { enum: ["loaded", "not-loaded"] },
          instruction: { enum: ["project-descendants-from-attested-statement"] },
        },
      },
      {
        type: "object",
        required: ["outcome", "batchStatuses", "message"],
        properties: {
          outcome: { enum: ["gone"] },
          batchStatuses: batchStatusesSchema(),
          message: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["outcome", "message"],
        properties: { outcome: { enum: ["audit-failure"] }, message: { type: "string" } },
      },
      {
        type: "object",
        required: ["outcome", "reason"],
        properties: {
          outcome: { enum: ["refused"] },
          reason: { type: "string" },
          batchStatuses: batchStatusesSchema(),
        },
      },
    ],
  })
  statementGrounding?: AskResponse["statementGrounding"];

  @ApiProperty({
    oneOf: [
      {
        type: "object",
        required: ["available", "department", "function", "plant", "period", "activeBatchIds"],
        properties: {
          available: { enum: [true] },
          department: { type: "string" },
          function: { type: "string" },
          plant: { type: "string" },
          period: { type: "string" },
          activeBatchIds: { type: "array", items: { type: "object" } },
        },
      },
      {
        type: "object",
        required: ["available", "reason"],
        properties: { available: { enum: [false] }, reason: { type: "string" } },
      },
    ],
  })
  viewInReport!: AskResponse["viewInReport"];

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ type: "object" })
  clarify?: AskResponse["clarify"];

  @ApiPropertyOptional()
  latencyMs?: number;
}

export class ChatStreamEventDto {
  @ApiProperty({ enum: ["phase", "token", "result", "error"] })
  type!: "phase" | "token" | "result" | "error";

  @ApiPropertyOptional({ type: ChatResponseDto })
  response?: ChatResponseDto;

  @ApiPropertyOptional({ enum: ["routing", "selecting", "querying", "summarizing"] })
  phase?: "routing" | "selecting" | "querying" | "summarizing";

  @ApiPropertyOptional()
  text?: string;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ enum: Object.values(ResponseClass) })
  responseClass?: ResponseClass;
}

function batchStatusesSchema() {
  return {
    type: "array",
    items: {
      type: "object",
      required: ["source", "period", "requestedBatchId", "status", "activeBatchId"],
      properties: {
        source: { enum: ["actuals", "budget"] },
        period: { type: "string" },
        requestedBatchId: { type: "string" },
        status: { enum: ["current", "replaced", "gone"] },
        activeBatchId: { type: "string", nullable: true },
      },
    },
  };
}

function leafExplanationProperties() {
  return {
    nodeKey: { type: "string" },
    leafKey: { type: "string" },
    block: { enum: ["selected", "fy26-27-ytd"] },
    budgetState: { enum: ["loaded", "not-loaded"] },
    rollup: {
      type: "array",
      items: {
        type: "object",
        required: ["plant", "costCentre", "glCode", "bucket", "mappingTarget", "provisional", "reason"],
        properties: {
          plant: { type: "string" },
          costCentre: { type: "string" },
          glCode: { type: "string" },
          bucket: { type: "string" },
          mappingTarget: { type: "object" },
          provisional: { type: "boolean" },
          reason: { type: "string", nullable: true },
        },
      },
    },
    transactions: {
      type: "object",
      required: ["lines", "footer", "totalCount", "pageSize"],
      properties: {
        lines: { type: "array", items: { type: "object" } },
        footer: { type: "object" },
        totalCount: { type: "number" },
        pageSize: { enum: [20] },
      },
    },
  };
}
