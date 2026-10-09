import { z } from "zod";

import {
  actualTransactionPageSchema,
  decimalSchema,
  financialMeasureIdSchema,
  financialQueryResultSchema,
  financialSelectionSchema,
  moneySchema,
} from "./financial-tools";

const identifierSchema = z.string().min(1).max(200);

export const FINANCIAL_CHAT_ERROR_REASONS = [
  "unsupported_selection",
  "context_expired",
  "permission_changed",
  "drill_expired",
  "data_unavailable",
  "model_unavailable",
  "model_timeout",
  "model_rate_limited",
  "cancelled",
  "conversation_capacity_reached",
  "process_capacity_reached",
  "concurrent_run",
  "query_too_broad",
  "feature_disabled",
  "access_denied",
  "no_plant_access",
  "invalid_pagination",
  "page_size_changed",
  "page_out_of_range",
  "preparation_timeout",
  "result_expired",
  "replay_expired",
  "detail_mismatch",
  "source_unavailable",
] as const;

export const financialChatErrorReasonSchema = z.enum(FINANCIAL_CHAT_ERROR_REASONS);

const fieldErrorSchema = z.object({ field: z.string().min(1), reason: z.string().min(1) }).strict();

export const financialChatErrorDetailsSchema = z
  .object({
    reason: financialChatErrorReasonSchema,
    fieldErrors: z.array(fieldErrorSchema).optional(),
    pinnedContinuationLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const dataSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("customer"), label: z.literal("Customer source data") }).strict(),
  z.object({ kind: z.literal("synthetic"), label: z.literal("Synthetic test data") }).strict(),
]);

const resultReferenceSchema = z.object({ resultId: identifierSchema }).strict();

const financialTotalBlockSchema = z
  .object({
    component: z.literal("FinancialTotal"),
    props: resultReferenceSchema
      .extend({
        title: z.string().min(1).max(200),
        rowKey: identifierSchema.nullable(),
        valueKey: z.enum([
          "actual",
          "availableActualSubtotal",
          "budget",
          "availableBudgetSubtotal",
          "rollover",
          "percentage",
        ]),
      })
      .strict(),
  })
  .strict();

const financialComparisonBlockSchema = z
  .object({
    component: z.literal("FinancialComparison"),
    props: resultReferenceSchema
      .extend({
        title: z.string().min(1).max(200),
        rowKeys: z.array(identifierSchema).min(1).max(199),
        valueKeys: z
          .array(
            z.enum([
              "actual",
              "availableActualSubtotal",
              "budget",
              "availableBudgetSubtotal",
              "rollover",
              "percentage",
            ]),
          )
          .min(2)
          .max(6),
      })
      .strict(),
  })
  .strict();

const monthlyTrendBlockSchema = z
  .object({
    component: z.literal("MonthlyTrend"),
    props: resultReferenceSchema
      .extend({
        title: z.string().min(1).max(200),
        rowKeys: z.array(identifierSchema).min(1).max(199),
        series: z
          .array(
            z
              .object({
                measureId: financialMeasureIdSchema,
                label: z.string().min(1).max(200),
              })
              .strict(),
          )
          .min(1)
          .max(4),
      })
      .strict(),
  })
  .strict();

const clarificationChoiceSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(1).max(200),
    description: z.string().min(1).max(500).nullable(),
  })
  .strict();

const clarificationCardBlockSchema = z
  .object({
    component: z.literal("ClarificationCard"),
    props: z
      .object({
        prompt: z.string().min(1).max(1_000),
        missingFields: z
          .array(z.enum(["plant", "period", "measure", "component", "reference"]))
          .min(1)
          .max(5),
        choices: z.array(clarificationChoiceSchema).max(200),
      })
      .strict(),
  })
  .strict();

export const financialChatUiBlockSchema = z.discriminatedUnion("component", [
  financialTotalBlockSchema,
  financialComparisonBlockSchema,
  monthlyTrendBlockSchema,
  clarificationCardBlockSchema,
]);

const availableMonthlyDeltaSchema = z
  .object({
    resultId: identifierSchema,
    measureId: financialMeasureIdSchema,
    previousRowKey: identifierSchema,
    currentRowKey: identifierSchema,
    amountChange: moneySchema,
    percentageChange: decimalSchema,
    reason: z.literal("available"),
  })
  .strict();

const nonpositiveMonthlyDeltaSchema = z
  .object({
    resultId: identifierSchema,
    measureId: financialMeasureIdSchema,
    previousRowKey: identifierSchema,
    currentRowKey: identifierSchema,
    amountChange: moneySchema,
    percentageChange: z.null(),
    reason: z.enum(["previous_zero", "previous_negative"]),
  })
  .strict();

const missingMonthlyDeltaSchema = z
  .object({
    resultId: identifierSchema,
    measureId: financialMeasureIdSchema,
    previousRowKey: identifierSchema,
    currentRowKey: identifierSchema,
    amountChange: z.null(),
    percentageChange: z.null(),
    reason: z.enum(["missing_previous", "missing_current"]),
  })
  .strict();

export const financialMonthlyDeltaSchema = z.union([
  availableMonthlyDeltaSchema,
  nonpositiveMonthlyDeltaSchema,
  missingMonthlyDeltaSchema,
]);

const preparedDetailSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), page: actualTransactionPageSchema }).strict(),
  z
    .object({
      status: z.literal("failed"),
      reason: z.enum([
        "preparation_timeout",
        "drill_expired",
        "permission_changed",
        "data_unavailable",
        "detail_mismatch",
      ]),
      message: z.string().min(1).max(500),
    })
    .strict(),
]);

const responseIdentity = {
  version: z.literal(1),
  conversationId: identifierSchema,
  turnId: identifierSchema,
};

const answerResponseSchema = z
  .object({
    ...responseIdentity,
    kind: z.literal("answer"),
    answer: z.string().min(1).max(4_000),
    scope: financialSelectionSchema,
    dataSource: dataSourceSchema,
    results: z.record(identifierSchema, financialQueryResultSchema),
    monthlyDeltas: z.array(financialMonthlyDeltaSchema).max(796),
    ui: z.array(financialChatUiBlockSchema).min(1).max(200),
    details: z.record(identifierSchema, preparedDetailSchema),
  })
  .strict()
  .superRefine(({ results, monthlyDeltas, ui, details }, context) => {
    const resultEntries = Object.entries(results);
    for (const [key, result] of resultEntries) {
      if (key !== result.resultId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "result dictionary keys must equal resultId",
          path: ["results", key],
        });
      }
    }

    for (const [index, block] of ui.entries()) {
      if (block.component === "ClarificationCard") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "answer responses cannot contain clarification cards",
          path: ["ui", index],
        });
        continue;
      }
      const result = results[block.props.resultId];
      if (!result) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UI blocks must reference an included result",
          path: ["ui", index, "props", "resultId"],
        });
        continue;
      }
      const rowKeys = new Set(result.rows.map(({ key }) => key));
      const referencedRows =
        block.component === "FinancialTotal" ? (block.props.rowKey ? [block.props.rowKey] : []) : block.props.rowKeys;
      if (referencedRows.some((rowKey) => !rowKeys.has(rowKey))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UI row keys must exist in the referenced result",
          path: ["ui", index, "props"],
        });
      }
    }

    monthlyDeltas.forEach(({ resultId }, index) => {
      if (!results[resultId]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly deltas must reference an included result",
          path: ["monthlyDeltas", index, "resultId"],
        });
      }
    });

    const promisedHandles = new Set<string>();
    for (const result of Object.values(results)) {
      const values = [result.totals, ...result.rows.map(({ values }) => values)];
      for (const valueSet of values) {
        if (valueSet.actual?.state === "available") promisedHandles.add(valueSet.actual.drilldownId);
        if (valueSet.availableActualSubtotal) promisedHandles.add(valueSet.availableActualSubtotal.drilldownId);
      }
    }
    for (const handle of promisedHandles) {
      if (!details[handle]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every advertised Actual needs a prepared detail outcome",
          path: ["details", handle],
        });
      }
    }
    for (const [handle, detail] of Object.entries(details)) {
      if (!promisedHandles.has(handle)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "detail entries must belong to an advertised Actual",
          path: ["details", handle],
        });
      }
      if (detail.status === "ready" && detail.page.drilldownId !== handle) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "prepared page handle must match its dictionary key",
          path: ["details", handle, "page", "drilldownId"],
        });
      }
    }
  });

const clarificationResponseSchema = z
  .object({
    ...responseIdentity,
    kind: z.literal("clarification"),
    answer: z.string().min(1).max(4_000),
    confirmedScope: financialSelectionSchema.nullable(),
    ui: z.array(clarificationCardBlockSchema).min(1).max(1),
  })
  .strict();

const refusalResponseSchema = z
  .object({
    ...responseIdentity,
    kind: z.enum(["unsupported", "error"]),
    answer: z.string().min(1).max(4_000),
    details: financialChatErrorDetailsSchema,
  })
  .strict();

export const financialChatResponseSchema = z.union([
  answerResponseSchema,
  clarificationResponseSchema,
  refusalResponseSchema,
]);

const capabilityUnavailableReasonSchema = z.enum([
  "feature_disabled",
  "access_denied",
  "no_plant_access",
  "model_unavailable",
]);

export const financialChatCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    available: z.boolean(),
    reason: capabilityUnavailableReasonSchema.nullable(),
    model: z.object({ provider: z.literal("anthropic"), modelId: z.literal("claude-sonnet-5-5") }).strict(),
    limits: z
      .object({
        maxPreparedActualScopes: z.literal(200),
        preparedTransactionRows: z.literal(10),
        defaultContinuationRows: z.literal(20),
        maxContinuationRows: z.literal(100),
        conversationIdleMinutes: z.literal(60),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ enabled, available, reason }, context) => {
    if (available !== (enabled && reason === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "availability must match enabled state and reason",
        path: ["available"],
      });
    }
    if (!enabled && reason !== "feature_disabled") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "disabled capability requires feature_disabled",
        path: ["reason"],
      });
    }
    if (enabled && reason === "feature_disabled") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enabled capability cannot be feature_disabled",
        path: ["reason"],
      });
    }
  });

const eventIdentity = {
  version: z.literal(1),
  eventId: identifierSchema,
  sequence: z.number().int().min(0).max(255),
  conversationId: identifierSchema,
  runId: identifierSchema,
};

export const financialChatEventSchema = z.discriminatedUnion("type", [
  z.object({ ...eventIdentity, type: z.literal("run_started") }).strict(),
  z.object({ ...eventIdentity, type: z.literal("text_delta"), text: z.string().min(1).max(4_000) }).strict(),
  z.object({ ...eventIdentity, type: z.literal("ui_block"), block: financialChatUiBlockSchema }).strict(),
  z.object({ ...eventIdentity, type: z.literal("final"), response: financialChatResponseSchema }).strict(),
  z
    .object({
      ...eventIdentity,
      type: z.literal("error"),
      error: z
        .object({
          message: z.string().min(1).max(500),
          details: financialChatErrorDetailsSchema,
          errorId: identifierSchema,
          correlationId: identifierSchema,
        })
        .strict(),
    })
    .strict(),
]);

export type FinancialChatErrorReason = z.infer<typeof financialChatErrorReasonSchema>;
export type FinancialChatErrorDetails = z.infer<typeof financialChatErrorDetailsSchema>;
export type FinancialChatUiBlock = z.infer<typeof financialChatUiBlockSchema>;
export type FinancialMonthlyDelta = z.infer<typeof financialMonthlyDeltaSchema>;
export type FinancialChatResponse = z.infer<typeof financialChatResponseSchema>;
export type FinancialChatCapabilities = z.infer<typeof financialChatCapabilitiesSchema>;
export type FinancialChatEvent = z.infer<typeof financialChatEventSchema>;
export type FinancialChatSource = z.infer<typeof dataSourceSchema>;

export type FinancialClarificationField = "plant" | "period" | "measure" | "component" | "reference";
