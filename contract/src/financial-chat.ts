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
const resultValueKeySchema = z.enum([
  "actual",
  "availableActualSubtotal",
  "budget",
  "availableBudgetSubtotal",
  "rollover",
  "percentage",
]);
const deltaMeasureIdSchema = z.enum(["actual", "budget", "rollover"]);

type QueryResult = z.infer<typeof financialQueryResultSchema>;
type QueryValues = QueryResult["totals"];
type QueryDimensions = QueryResult["rows"][number]["dimensions"];
type ResultValueKey = z.infer<typeof resultValueKeySchema>;
type DeltaMeasureId = z.infer<typeof deltaMeasureIdSchema>;

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

export const financialChatErrorDetailsSchema = z.discriminatedUnion("reason", [
  z
    .object({
      reason: z.literal("invalid_pagination"),
      fieldErrors: z.array(fieldErrorSchema).min(1),
    })
    .strict(),
  z
    .object({
      reason: z.literal("page_size_changed"),
      pinnedContinuationLimit: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      reason: financialChatErrorReasonSchema.exclude(["invalid_pagination", "page_size_changed"]),
    })
    .strict(),
]);

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
        valueKey: resultValueKeySchema,
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
        valueKeys: z.array(resultValueKeySchema).min(2).max(6),
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
    measureId: deltaMeasureIdSchema,
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
    measureId: deltaMeasureIdSchema,
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
    measureId: deltaMeasureIdSchema,
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

function sameSelection(
  left: z.infer<typeof financialSelectionSchema>,
  right: z.infer<typeof financialSelectionSchema>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valuesAt(result: QueryResult, rowKey: string | null): QueryValues | undefined {
  return rowKey === null ? result.totals : result.rows.find(({ key }) => key === rowKey)?.values;
}

function requestedValue(result: QueryResult, valueKey: ResultValueKey) {
  if (valueKey === "availableActualSubtotal") return result.selection.measureIds.includes("actual");
  if (valueKey === "availableBudgetSubtotal") return result.selection.measureIds.includes("budget");
  if (valueKey === "percentage") {
    return (
      result.selection.measureIds.includes("percentage") ||
      result.selection.comparisons?.includes("actual_vs_budget") === true
    );
  }
  return result.selection.measureIds.includes(valueKey);
}

function hasRequestedValue(result: QueryResult, rowKey: string | null, valueKey: ResultValueKey) {
  const values = valuesAt(result, rowKey);
  return requestedValue(result, valueKey) && values !== undefined && valueKey in values;
}

function availableMeasureValue(values: QueryValues, measureId: DeltaMeasureId) {
  const value = values[measureId];
  return value?.state === "available" ? value.value : null;
}

function isZeroMoney(value: string) {
  return /^-?0\.00$/.test(value);
}

function isNegativeMoney(value: string) {
  return value.startsWith("-") && !isZeroMoney(value);
}

function normalizedResultCoordinate(result: QueryResult, dimensions: QueryDimensions | null) {
  const dimensionIds = [...result.selection.dimensionIds].sort();
  if (dimensions) return JSON.stringify(dimensionIds.map((dimensionId) => [dimensionId, dimensions[dimensionId]]));

  const totalCoordinate = dimensionIds.map((dimensionId) => {
    if (dimensionId === "plant" && result.selection.plantIds.length === 1) {
      return [dimensionId, result.selection.plantIds[0]];
    }
    if (
      dimensionId === "month" &&
      result.selection.timeWindow.from.slice(0, 7) === result.selection.timeWindow.to.slice(0, 7)
    ) {
      return [dimensionId, `${result.selection.timeWindow.from.slice(0, 7)}-01`];
    }
    const filter = result.selection.filters.find(
      (candidate) =>
        candidate.dimensionId === dimensionId &&
        (candidate.operator === "eq" || (candidate.operator === "in" && candidate.values.length === 1)),
    );
    const value =
      filter?.operator === "eq"
        ? filter.value
        : filter?.operator === "in" && filter.values.length === 1
          ? filter.values[0]
          : undefined;
    return [dimensionId, value];
  });
  return totalCoordinate.some(([, value]) => value === undefined)
    ? JSON.stringify(["total"])
    : JSON.stringify(totalCoordinate);
}

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
  .superRefine(({ scope, results, monthlyDeltas, ui, details }, context) => {
    const resultEntries = Object.entries(results);
    for (const [key, result] of resultEntries) {
      if (key !== result.resultId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "result dictionary keys must equal resultId",
          path: ["results", key],
        });
      }
      if (!sameSelection(scope, result.selection)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "included results must use the confirmed answer scope",
          path: ["results", key, "selection"],
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
      if (new Set(referencedRows).size !== referencedRows.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UI row references must be unique",
          path: ["ui", index, "props"],
        });
      }
      if (block.component === "FinancialTotal") {
        if (!hasRequestedValue(result, block.props.rowKey, block.props.valueKey)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "UI values must be present and requested in the referenced result",
            path: ["ui", index, "props", "valueKey"],
          });
        }
      } else if (block.component === "FinancialComparison") {
        if (new Set(block.props.valueKeys).size !== block.props.valueKeys.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "comparison values must be unique",
            path: ["ui", index, "props", "valueKeys"],
          });
        }
        if (
          block.props.rowKeys.some((rowKey) =>
            block.props.valueKeys.some((valueKey) => !hasRequestedValue(result, rowKey, valueKey)),
          )
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "UI values must be present and requested in the referenced result",
            path: ["ui", index, "props"],
          });
        }
      } else {
        if (!result.selection.dimensionIds.includes("month")) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MonthlyTrend requires month-grouped results",
            path: ["ui", index, "props", "resultId"],
          });
        }
        if (new Set(block.props.series.map(({ measureId }) => measureId)).size !== block.props.series.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "trend series must be unique",
            path: ["ui", index, "props", "series"],
          });
        }
        if (
          block.props.rowKeys.some((rowKey) => {
            const row = result.rows.find(({ key }) => key === rowKey);
            return (
              !row?.dimensions.month ||
              block.props.series.some(({ measureId }) => !hasRequestedValue(result, rowKey, measureId))
            );
          })
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "trend rows must contain requested monthly series values",
            path: ["ui", index, "props"],
          });
        }
      }
    }

    const deltaCoordinates = new Set<string>();
    monthlyDeltas.forEach((delta, index) => {
      const result = results[delta.resultId];
      if (!result) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly deltas must reference an included result",
          path: ["monthlyDeltas", index, "resultId"],
        });
        return;
      }
      const previous = result.rows.find(({ key }) => key === delta.previousRowKey);
      const current = result.rows.find(({ key }) => key === delta.currentRowKey);
      const coordinate = `${delta.resultId}\u0000${delta.measureId}\u0000${delta.previousRowKey}\u0000${delta.currentRowKey}`;
      if (deltaCoordinates.has(coordinate)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly delta coordinates must be unique",
          path: ["monthlyDeltas", index],
        });
      }
      deltaCoordinates.add(coordinate);
      if (
        !result.selection.dimensionIds.includes("month") ||
        !result.selection.measureIds.includes(delta.measureId) ||
        !previous?.dimensions.month ||
        !current?.dimensions.month ||
        previous.dimensions.month >= current.dimensions.month
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly deltas must reference ordered monthly rows for a requested measure",
          path: ["monthlyDeltas", index],
        });
        return;
      }
      if (
        result.selection.dimensionIds.some(
          (dimensionId) =>
            dimensionId !== "month" && previous.dimensions[dimensionId] !== current.dimensions[dimensionId],
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly delta rows must share every non-month dimension coordinate",
          path: ["monthlyDeltas", index],
        });
      }
      const nextMonth = new Date(`${previous.dimensions.month}T00:00:00.000Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      if (nextMonth.toISOString().slice(0, 10) !== current.dimensions.month) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "monthly delta rows must be consecutive calendar months",
          path: ["monthlyDeltas", index],
        });
      }
      const previousValue = availableMeasureValue(previous.values, delta.measureId);
      const currentValue = availableMeasureValue(current.values, delta.measureId);
      if (["available", "previous_zero", "previous_negative"].includes(delta.reason)) {
        if (previousValue === null || currentValue === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "numeric monthly deltas require complete source values",
            path: ["monthlyDeltas", index],
          });
        } else if (
          (delta.reason === "available" && (isZeroMoney(previousValue) || isNegativeMoney(previousValue))) ||
          (delta.reason === "previous_zero" && !isZeroMoney(previousValue)) ||
          (delta.reason === "previous_negative" && !isNegativeMoney(previousValue))
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "monthly delta reason must match the previous value state",
            path: ["monthlyDeltas", index, "reason"],
          });
        }
      } else if (
        (delta.reason === "missing_previous" && previousValue !== null) ||
        (delta.reason === "missing_current" && currentValue !== null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "missing monthly delta reasons require an unavailable named value",
          path: ["monthlyDeltas", index, "reason"],
        });
      }
    });

    const promisedHandles = new Map<string, { scopeIdentity: string; value: string }>();
    const advertisedScopes = new Set<string>();
    for (const result of Object.values(results)) {
      const valueSets = [
        { values: result.totals, dimensions: null },
        ...result.rows.map(({ values, dimensions }) => ({ values, dimensions })),
      ];
      for (const { values, dimensions } of valueSets) {
        const advertised =
          values.actual?.state === "available"
            ? { handle: values.actual.drilldownId, kind: "actual", value: values.actual.value }
            : values.availableActualSubtotal
              ? {
                  handle: values.availableActualSubtotal.drilldownId,
                  kind: "availableActualSubtotal",
                  value: values.availableActualSubtotal.value,
                }
              : null;
        if (!advertised) continue;
        const scopeIdentity = JSON.stringify([
          result.selection,
          normalizedResultCoordinate(result, dimensions),
          advertised.kind,
          advertised.value,
        ]);
        advertisedScopes.add(scopeIdentity);
        const prior = promisedHandles.get(advertised.handle);
        if (prior && prior.value !== advertised.value) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "reused Actual handles must advertise one exact value",
            path: ["details", advertised.handle],
          });
        }
        if (prior && prior.scopeIdentity !== scopeIdentity) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "reused Actual handles must identify one exact selection, coordinate, kind, and value",
            path: ["details", advertised.handle],
          });
        }
        if (!prior) promisedHandles.set(advertised.handle, { scopeIdentity, value: advertised.value });
      }
    }
    if (advertisedScopes.size > 200) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "an answer cannot advertise more than 200 Actual scopes",
        path: ["details"],
      });
    }
    for (const handle of promisedHandles.keys()) {
      if (!details[handle]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every advertised Actual needs a prepared detail outcome",
          path: ["details", handle],
        });
      }
    }
    for (const [handle, detail] of Object.entries(details)) {
      const advertised = promisedHandles.get(handle);
      if (!advertised) {
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
      if (
        detail.status === "ready" &&
        (detail.page.page !== 1 || detail.page.limit !== 10 || detail.page.matchingActualTotal !== advertised?.value)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ready details must be the prepared first page with the advertised exact total",
          path: ["details", handle, "page"],
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

export const financialChatEventSchema = z
  .discriminatedUnion("type", [
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
  ])
  .superRefine((event, context) => {
    if (event.type === "final" && event.conversationId !== event.response.conversationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "final frame and response conversation identities must match",
        path: ["response", "conversationId"],
      });
    }
  });

export type FinancialChatErrorReason = z.infer<typeof financialChatErrorReasonSchema>;
export type FinancialChatErrorDetails = z.infer<typeof financialChatErrorDetailsSchema>;
export type FinancialChatUiBlock = z.infer<typeof financialChatUiBlockSchema>;
export type FinancialMonthlyDelta = z.infer<typeof financialMonthlyDeltaSchema>;
export type FinancialChatResponse = z.infer<typeof financialChatResponseSchema>;
export type FinancialChatCapabilities = z.infer<typeof financialChatCapabilitiesSchema>;
export type FinancialChatEvent = z.infer<typeof financialChatEventSchema>;
export type FinancialChatSource = z.infer<typeof dataSourceSchema>;

export type FinancialClarificationField = "plant" | "period" | "measure" | "component" | "reference";
