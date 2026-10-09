import { z } from "zod";

export const FINANCIAL_MEASURE_IDS = ["actual", "budget", "rollover", "percentage"] as const;
export const FINANCIAL_DIMENSION_IDS = [
  "plant",
  "month",
  "gl",
  "cost_center",
  "nursery_component",
  "section",
  "consideration",
  "short_name",
  "contra_account",
  "origin",
  "location",
] as const;

export const financialMeasureIdSchema = z
  .enum(FINANCIAL_MEASURE_IDS)
  .describe("A governed financial measure identifier.");
export const financialDimensionIdSchema = z
  .enum(FINANCIAL_DIMENSION_IDS)
  .describe("A governed financial grouping or filter dimension identifier.");

export const moneySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/)
  .describe("An exact signed monetary amount with two decimal places; never a JavaScript number.");

export const decimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .describe("An exact signed base-10 decimal string without exponent notation.");

const identifierSchema = z.string().min(1).max(200);
const dateSchema = z.string().date();

const dimensionFilterSchema = z.discriminatedUnion("operator", [
  z
    .object({
      dimensionId: financialDimensionIdSchema,
      operator: z.enum(["eq", "neq"]),
      value: identifierSchema,
    })
    .strict(),
  z
    .object({
      dimensionId: financialDimensionIdSchema,
      operator: z.literal("in"),
      values: z.array(identifierSchema).min(1).max(200),
    })
    .strict(),
]);

const timeWindowSchema = z
  .object({
    kind: z.enum(["month", "range", "financial_ytd"]),
    from: dateSchema,
    to: dateSchema,
  })
  .strict()
  .superRefine(({ kind, from, to }, context) => {
    if (from > to) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "from must not be after to", path: ["from"] });
      return;
    }

    const [toYear, toMonth] = to.split("-").map(Number);
    const lastDay = new Date(Date.UTC(toYear, toMonth, 0)).toISOString().slice(0, 10);
    if (kind === "month" && (from.slice(0, 7) !== to.slice(0, 7) || !from.endsWith("-01") || to !== lastDay)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "month must resolve to one complete month" });
    }
    if (kind === "range" && (!from.endsWith("-01") || to !== lastDay)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "range must contain complete months" });
    }
    if (kind === "financial_ytd") {
      const fiscalStartYear = toMonth < 4 ? toYear - 1 : toYear;
      if (from !== `${fiscalStartYear}-04-01` || to !== lastDay) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "financial_ytd must start on April 1 and end on a month boundary",
        });
      }
    }
  });

const actualOnlyDimensions = new Set([
  "cost_center",
  "section",
  "consideration",
  "short_name",
  "contra_account",
  "origin",
  "location",
]);
const UNMAPPED_NURSERY_COMPONENT = "unmapped-GL";

function hasUnsupportedMeasureDimensionCombination(measureIds: readonly string[], dimensionIds: readonly string[]) {
  return (
    measureIds.some((measureId) => measureId !== "actual") &&
    dimensionIds.some((dimensionId) => actualOnlyDimensions.has(dimensionId))
  );
}

export const financialSelectionSchema = z
  .object({
    measureIds: z.array(financialMeasureIdSchema).min(1).max(FINANCIAL_MEASURE_IDS.length),
    dimensionIds: z.array(financialDimensionIdSchema).max(FINANCIAL_DIMENSION_IDS.length),
    plantIds: z.array(identifierSchema).min(1).max(200),
    timeWindow: timeWindowSchema,
    filters: z.array(dimensionFilterSchema).max(50),
    comparisons: z.array(z.literal("actual_vs_budget")).max(1).optional(),
  })
  .strict()
  .superRefine(({ measureIds, dimensionIds, plantIds, filters, comparisons }, context) => {
    if (new Set(measureIds).size !== measureIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "measureIds must be unique", path: ["measureIds"] });
    }
    if (new Set(dimensionIds).size !== dimensionIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "dimensionIds must be unique", path: ["dimensionIds"] });
    }
    if (new Set(plantIds).size !== plantIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "plantIds must be unique", path: ["plantIds"] });
    }
    if (hasUnsupportedMeasureDimensionCombination(measureIds, dimensionIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Budget, Roll-over, and percentage cannot use Actual-only dimensions",
        path: ["dimensionIds"],
      });
    }
    if (
      hasUnsupportedMeasureDimensionCombination(
        measureIds,
        filters.map(({ dimensionId }) => dimensionId),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Budget, Roll-over, and percentage cannot use Actual-only filters",
        path: ["filters"],
      });
    }
    const percentageOnly = measureIds.length === 1 && measureIds[0] === "percentage";
    if (
      comparisons?.includes("actual_vs_budget") &&
      !percentageOnly &&
      (!measureIds.includes("actual") || !measureIds.includes("budget"))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "actual_vs_budget requires both Actual and Budget unless only percentage is returned",
        path: ["comparisons"],
      });
    }
    if (measureIds.includes("percentage") && !comparisons?.includes("actual_vs_budget")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "percentage requires an explicit Actual versus Budget comparison",
        path: ["measureIds"],
      });
    }
  })
  .describe(
    "A resolved, permission-independent financial selection containing governed identifiers and no SQL or executable code.",
  );

const catalogMeasureSchema = z
  .object({
    id: financialMeasureIdSchema,
    label: identifierSchema,
    description: z.string().min(20).max(500),
  })
  .strict();

const catalogDimensionSchema = z
  .object({
    id: financialDimensionIdSchema,
    label: identifierSchema,
    description: z.string().min(10).max(500),
    supportedMeasureIds: z.array(financialMeasureIdSchema).min(1),
  })
  .strict();

const catalogCombinationSchema = z
  .object({
    measureIds: z.array(financialMeasureIdSchema).min(1),
    dimensionIds: z.array(financialDimensionIdSchema),
  })
  .strict()
  .superRefine(({ measureIds, dimensionIds }, context) => {
    if (new Set(measureIds).size !== measureIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "measureIds must be unique", path: ["measureIds"] });
    }
    if (new Set(dimensionIds).size !== dimensionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dimensionIds must be unique",
        path: ["dimensionIds"],
      });
    }
    if (hasUnsupportedMeasureDimensionCombination(measureIds, dimensionIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The combination requests a non-Actual measure at an Actual-only grain",
      });
    }
  });

export const financialCatalogSchema = z
  .object({
    measures: z.array(catalogMeasureSchema).min(1),
    dimensions: z.array(catalogDimensionSchema).min(1),
    combinations: z.array(catalogCombinationSchema).min(1),
    timeWindows: z.array(z.enum(["month", "range", "financial_ytd"])).min(1),
    fiscalYearStartMonth: z.literal(4),
    limits: z
      .object({
        maxAggregateRows: z.literal(199),
        maxPreparedActualScopes: z.literal(200),
        preparedTransactionRows: z.literal(10),
        defaultContinuationRows: z.literal(20),
        maxContinuationRows: z.literal(100),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ measures, dimensions, combinations, timeWindows }, context) => {
    const measureIds = measures.map(({ id }) => id);
    const dimensionIds = dimensions.map(({ id }) => id);
    for (const [values, path] of [
      [measureIds, "measures"],
      [dimensionIds, "dimensions"],
      [timeWindows, "timeWindows"],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${path} must be unique`, path: [path] });
      }
    }

    const declaredMeasures = new Set(measureIds);
    const declaredDimensions = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
    dimensions.forEach((dimension, index) => {
      if (new Set(dimension.supportedMeasureIds).size !== dimension.supportedMeasureIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "supportedMeasureIds must be unique",
          path: ["dimensions", index],
        });
      }
      if (hasUnsupportedMeasureDimensionCombination(dimension.supportedMeasureIds, [dimension.id])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dimension support contradicts the governed matrix",
          path: ["dimensions", index],
        });
      }
      if (dimension.supportedMeasureIds.some((measureId) => !declaredMeasures.has(measureId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dimension supports an undeclared measure",
          path: ["dimensions", index, "supportedMeasureIds"],
        });
      }
    });

    combinations.forEach(({ measureIds: combinationMeasures, dimensionIds: combinationDimensions }, index) => {
      if (combinationMeasures.some((measureId) => !declaredMeasures.has(measureId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "combination uses an undeclared measure",
          path: ["combinations", index],
        });
      }
      for (const dimensionId of combinationDimensions) {
        const dimension = declaredDimensions.get(dimensionId);
        if (!dimension || combinationMeasures.some((measureId) => !dimension.supportedMeasureIds.includes(measureId))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "combination contradicts its dimension's supported measures",
            path: ["combinations", index],
          });
        }
      }
    });
  })
  .describe(
    "The code-authored financial vocabulary, compatible combinations, fiscal calendar, and enforced query limits.",
  );

export const dimensionMatchSchema = z
  .object({
    dimensionId: financialDimensionIdSchema,
    value: identifierSchema,
    label: identifierSchema,
    aliases: z.array(identifierSchema),
  })
  .strict();

const actualValueSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("available"),
      value: moneySchema,
      label: z.literal("Actual"),
      drilldownId: identifierSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("not_loaded"),
      value: z.null(),
      label: z.literal("Actual data not loaded"),
      drilldownId: z.null(),
    })
    .strict(),
]);

const budgetValueSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), value: moneySchema, label: z.literal("Budget") }).strict(),
  z
    .object({
      state: z.literal("not_loaded"),
      value: z.null(),
      label: z.literal("Budget not loaded for this Plant or month"),
    })
    .strict(),
  z
    .object({ state: z.literal("no_gl_line"), value: z.null(), label: z.literal("No Budget line for this GL") })
    .strict(),
  z
    .object({ state: z.literal("unmapped"), value: z.null(), label: z.literal("No Budget assigned to Unmapped") })
    .strict(),
]);

const rolloverValueSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), value: moneySchema, label: z.literal("Roll-over") }).strict(),
  z
    .object({
      state: z.literal("not_loaded"),
      value: z.null(),
      label: z.literal("Budget not loaded for this Plant or month"),
    })
    .strict(),
]);

const percentageValueSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), value: decimalSchema, label: z.literal("Percentage") }).strict(),
  z.object({ state: z.literal("not_applicable"), value: z.null(), label: z.literal("Not applicable") }).strict(),
]);

const availableActualSubtotalSchema = z
  .object({
    value: moneySchema,
    label: z.literal("Available-data Actual subtotal — completeness unconfirmed"),
    drilldownId: identifierSchema,
  })
  .strict();

const availableBudgetSubtotalSchema = z
  .object({
    value: moneySchema,
    label: z.literal("Available-only Budget subtotal — coverage incomplete"),
  })
  .strict();

const financialResultValuesSchema = z
  .object({
    actual: actualValueSchema.optional(),
    availableActualSubtotal: availableActualSubtotalSchema.optional(),
    budget: budgetValueSchema.optional(),
    availableBudgetSubtotal: availableBudgetSubtotalSchema.optional(),
    rollover: rolloverValueSchema.optional(),
    percentage: percentageValueSchema.optional(),
  })
  .strict()
  .refine((values) => Object.keys(values).length > 0, "At least one financial value is required")
  .refine(
    ({ actual, availableActualSubtotal }) => !availableActualSubtotal || actual?.state === "not_loaded",
    "An available-data subtotal is distinct from an unavailable complete Actual",
  )
  .refine(
    ({ budget, availableBudgetSubtotal }) => !availableBudgetSubtotal || budget?.state === "not_loaded",
    "An available-only Budget subtotal is distinct from unavailable complete Budget",
  );

const financialResultRowSchema = z
  .object({
    key: identifierSchema,
    dimensions: z.record(financialDimensionIdSchema, identifierSchema.nullable()),
    values: financialResultValuesSchema,
  })
  .strict();

export const financialQueryResultSchema = z
  .object({
    resultId: identifierSchema,
    selection: financialSelectionSchema,
    scope: z.object({ plantIds: z.array(identifierSchema).min(1), from: dateSchema, to: dateSchema }).strict(),
    rows: z.array(financialResultRowSchema).max(199),
    totals: financialResultValuesSchema,
    coverage: z.array(
      z
        .object({
          plantId: identifierSchema,
          month: dateSchema,
          actual: z.enum(["complete", "unconfirmed", "not_loaded"]),
          budget: z.enum(["loaded", "not_loaded"]),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine(({ selection, scope, rows, totals, coverage }, context) => {
    const expectedCoverage = new Set<string>();
    const cursor = new Date(`${selection.timeWindow.from.slice(0, 7)}-01T00:00:00.000Z`);
    const lastMonth = selection.timeWindow.to.slice(0, 7);
    while (cursor.toISOString().slice(0, 7) <= lastMonth) {
      const month = cursor.toISOString().slice(0, 10);
      selection.plantIds.forEach((plantId) => expectedCoverage.add(`${plantId}\u0000${month}`));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const actualCoverage = coverage.map(({ plantId, month }) => `${plantId}\u0000${month}`);
    if (
      new Set(selection.plantIds).size !== selection.plantIds.length ||
      new Set(actualCoverage).size !== actualCoverage.length ||
      actualCoverage.length !== expectedCoverage.size ||
      actualCoverage.some((key) => !expectedCoverage.has(key))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "coverage must contain each selected Plant and month exactly once",
        path: ["coverage"],
      });
    }
    const selectedPlants = new Set(selection.plantIds);
    const scopedPlants = new Set(scope.plantIds);
    if (
      scope.from !== selection.timeWindow.from ||
      scope.to !== selection.timeWindow.to ||
      scopedPlants.size !== scope.plantIds.length ||
      scopedPlants.size !== selectedPlants.size ||
      [...selectedPlants].some((plantId) => !scopedPlants.has(plantId))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope must equal the validated selection",
        path: ["scope"],
      });
    }

    const expectedDimensionIds = [...selection.dimensionIds].sort();
    rows.forEach(({ dimensions }, index) => {
      const rowDimensionIds = Object.keys(dimensions).sort();
      if (
        rowDimensionIds.length !== expectedDimensionIds.length ||
        rowDimensionIds.some((dimensionId, dimensionIndex) => dimensionId !== expectedDimensionIds[dimensionIndex])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "row dimensions must equal the selected grouping",
          path: ["rows", index, "dimensions"],
        });
      }
      const plant = dimensions.plant;
      const month = dimensions.month;
      if (
        (selection.dimensionIds.includes("plant") &&
          (plant === null || plant === undefined || !selection.plantIds.includes(plant))) ||
        (selection.dimensionIds.includes("month") &&
          (month === null || month === undefined || !expectedCoverage.has(`${selection.plantIds[0]}\u0000${month}`)))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "row dimension coordinate is outside the selected scope",
          path: ["rows", index, "dimensions"],
        });
      }
    });

    const valueSets = [{ values: totals, dimensions: undefined }, ...rows];
    valueSets.forEach(({ values, dimensions }, index) => {
      const relevantCoverage = coverage.filter(
        ({ plantId, month }) =>
          (!dimensions?.plant || dimensions.plant === plantId) && (!dimensions?.month || dimensions.month === month),
      );
      const path: Array<string | number> = [
        index === 0 ? "totals" : "rows",
        ...(index === 0 ? [] : [index - 1, "values"]),
      ];
      const requiredValueKeys = new Set<string>(selection.measureIds);
      if (selection.comparisons?.includes("actual_vs_budget")) {
        requiredValueKeys.add("percentage");
      }
      const completeActualCoverage =
        relevantCoverage.length > 0 && relevantCoverage.every(({ actual }) => actual === "complete");
      const hasSourceCoveredActual = relevantCoverage.some(({ actual }) => actual !== "not_loaded");
      if (selection.measureIds.includes("actual") && !completeActualCoverage && hasSourceCoveredActual) {
        requiredValueKeys.add("availableActualSubtotal");
      }
      const hasLoadedBudget = relevantCoverage.some(({ budget }) => budget === "loaded");
      const hasMissingBudget = relevantCoverage.some(({ budget }) => budget === "not_loaded");
      const isUnmappedRow = dimensions?.nursery_component === UNMAPPED_NURSERY_COMPONENT;
      if (selection.measureIds.includes("budget") && hasLoadedBudget && hasMissingBudget && !isUnmappedRow) {
        requiredValueKeys.add("availableBudgetSubtotal");
      }
      const valueKeys = Object.keys(values);
      if (
        valueKeys.length !== requiredValueKeys.size ||
        valueKeys.some((key) => !requiredValueKeys.has(key)) ||
        [...requiredValueKeys].some((key) => !(key in values))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "result values must equal the requested measures and required partial companions",
          path,
        });
      }
      if (
        values.actual &&
        (relevantCoverage.length === 0 ||
          (values.actual.state === "available") !== relevantCoverage.every(({ actual }) => actual === "complete"))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Actual state contradicts its Plant/month coverage",
          path: [...path, "actual"],
        });
      }
      if (
        values.budget &&
        ["available", "not_loaded"].includes(values.budget.state) &&
        (relevantCoverage.length === 0 ||
          (values.budget.state === "available") !== relevantCoverage.every(({ budget }) => budget === "loaded"))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Budget state contradicts its Plant/month coverage",
          path: [...path, "budget"],
        });
      }
      if (
        values.budget?.state === "no_gl_line" &&
        (relevantCoverage.length === 0 || relevantCoverage.some(({ budget }) => budget !== "loaded"))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "special Budget states require loaded coverage",
          path: [...path, "budget"],
        });
      }
      if (
        (values.budget?.state === "no_gl_line" &&
          (!dimensions || !selection.dimensionIds.includes("gl") || !dimensions.gl)) ||
        (values.budget?.state === "unmapped" && !isUnmappedRow) ||
        (isUnmappedRow && selection.measureIds.includes("budget") && values.budget?.state !== "unmapped")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "special Budget state does not match the row grouping",
          path: [...path, "budget"],
        });
      }
      if (values.availableActualSubtotal && (completeActualCoverage || !hasSourceCoveredActual)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "available-data subtotal requires incomplete coverage with source-covered Actual",
          path: [...path, "availableActualSubtotal"],
        });
      }
      if (values.rollover) {
        const closingMonth = relevantCoverage.reduce(
          (latest, entry) => (entry.month > latest ? entry.month : latest),
          "",
        );
        const closingCoverage = relevantCoverage.filter(({ month }) => month === closingMonth);
        const closingLoaded = closingCoverage.length > 0 && closingCoverage.every(({ budget }) => budget === "loaded");
        if ((values.rollover.state === "available") !== closingLoaded) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Roll-over state must match closing-month Budget coverage",
            path: [...path, "rollover"],
          });
        }
      }
      const percentageCoverageAvailable =
        relevantCoverage.length > 0 &&
        relevantCoverage.every(({ actual, budget }) => actual === "complete" && budget === "loaded");
      const explicitActualAvailable = values.actual?.state === "available";
      const explicitBudgetNonzero = values.budget?.state === "available" && !/^-?0\.00$/.test(values.budget.value);
      if (values.percentage?.state === "available") {
        const invalidActual = values.actual !== undefined && !explicitActualAvailable;
        const invalidBudget = values.budget !== undefined && !explicitBudgetNonzero;
        if (invalidActual || invalidBudget) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "available percentage requires complete Actual and nonzero loaded Budget",
            path: [...path, "percentage"],
          });
        }
        if (!percentageCoverageAvailable) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "available percentage contradicts incomplete coverage",
            path: [...path, "percentage"],
          });
        }
      }
      if (
        values.percentage?.state === "not_applicable" &&
        values.actual !== undefined &&
        values.budget !== undefined &&
        explicitActualAvailable &&
        explicitBudgetNonzero &&
        percentageCoverageAvailable
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Not applicable requires an unavailable, special, or zero comparison input",
          path: [...path, "percentage"],
        });
      }
    });
  })
  .describe(
    "A server-calculated financial result with exact strings, explicit coverage, and opaque Actual drill references.",
  );

const financialTransactionSchema = z
  .object({
    id: identifierSchema,
    transactionNumber: identifierSchema,
    lineId: identifierSchema,
    postingDate: dateSchema,
    reportingMonth: dateSchema,
    plantId: identifierSchema,
    plantLabel: identifierSchema,
    costCenterId: identifierSchema.nullable(),
    costCenterLabel: identifierSchema,
    glAccountId: identifierSchema.nullable(),
    glCode: identifierSchema.nullable(),
    glName: identifierSchema.nullable(),
    debit: moneySchema,
    credit: moneySchema,
    actual: moneySchema,
    memo: z.string().nullable(),
    reference: z.string().nullable(),
  })
  .strict();

export const actualTransactionPageSchema = z
  .object({
    drilldownId: identifierSchema,
    transactions: z.array(financialTransactionSchema).max(100),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(1),
    matchingActualTotal: moneySchema,
    preparedSize: z.literal(10),
    defaultContinuationLimit: z.literal(20),
    pinnedContinuationLimit: z.number().int().min(1).max(100).nullable(),
  })
  .strict()
  .superRefine(
    (
      {
        transactions,
        page,
        limit,
        totalItems,
        totalPages,
        preparedSize,
        defaultContinuationLimit,
        pinnedContinuationLimit,
      },
      context,
    ) => {
      if (page === 1 && limit !== preparedSize) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "page 1 uses the fixed prepared size",
          path: ["limit"],
        });
      }
      if (page >= 2 && (pinnedContinuationLimit === null || limit !== pinnedContinuationLimit)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "continuation pages use the pinned limit",
          path: ["limit"],
        });
      }
      const continuationLimit = pinnedContinuationLimit ?? defaultContinuationLimit;
      const expectedTotalPages = 1 + Math.ceil(Math.max(totalItems - preparedSize, 0) / continuationLimit);
      if (totalPages !== expectedTotalPages) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "totalPages does not match the prepared-page formula",
          path: ["totalPages"],
        });
      }
      if (page > totalPages) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "page is out of range", path: ["page"] });
      }
      const offset = page === 1 ? 0 : preparedSize + (page - 2) * continuationLimit;
      const expectedItems = Math.min(limit, Math.max(totalItems - offset, 0));
      if (transactions.length !== expectedItems) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "transaction count does not match page metadata",
          path: ["transactions"],
        });
      }
    },
  )
  .describe(
    "An authorized page of Actual transactions plus the complete matching count and exact total for its opaque scope.",
  );

const emptyToolInputSchema = z
  .object({})
  .strict()
  .describe("No model-supplied input; the server resolves current authorization.");
const findDimensionValuesInputSchema = z
  .object({ dimensionId: financialDimensionIdSchema, search: z.string().trim().min(1).max(200) })
  .strict()
  .describe("A governed dimension and user-authored search term; the server applies current Plant grants.");
const findDimensionValuesOutputSchema = z
  .object({ matches: z.array(dimensionMatchSchema).max(200) })
  .strict()
  .describe("Permission-scoped canonical dimension matches and aliases, preserving ambiguity for clarification.");
const getActualTransactionsInputSchema = z
  .object({ drilldownId: identifierSchema, page: z.number().int().min(1), limit: z.number().int().min(1).max(100) })
  .strict()
  .refine(({ page, limit }) => page !== 1 || limit === 10, {
    message: "page 1 uses the fixed prepared size",
    path: ["limit"],
  })
  .describe(
    "An opaque server-issued Actual scope and validated page coordinates; never SQL or client-authored filters.",
  );

export const FINANCIAL_TOOL_DEFINITIONS = [
  {
    name: "get_financial_catalog",
    description:
      "Lists the governed financial measures, dimensions, valid combinations, time windows, and limits available for selection.",
    inputSchema: emptyToolInputSchema,
    outputSchema: financialCatalogSchema,
  },
  {
    name: "find_dimension_values",
    description:
      "Resolves a user phrase to permission-scoped canonical dimension values while preserving ambiguous matches for clarification.",
    inputSchema: findDimensionValuesInputSchema,
    outputSchema: findDimensionValuesOutputSchema,
  },
  {
    name: "query_financials",
    description:
      "Validates a governed selection and returns server-calculated exact financial results; it never accepts SQL, joins, or formulas.",
    inputSchema: financialSelectionSchema,
    outputSchema: financialQueryResultSchema,
  },
  {
    name: "get_actual_transactions",
    description:
      "Reads the authorized transactions behind an opaque Actual handle with stable pagination and the complete matching exact total.",
    inputSchema: getActualTransactionsInputSchema,
    outputSchema: actualTransactionPageSchema,
  },
] as const;

export type FinancialMeasureId = z.infer<typeof financialMeasureIdSchema>;
export type FinancialDimensionId = z.infer<typeof financialDimensionIdSchema>;
export type Money = z.infer<typeof moneySchema>;
export type FinancialSelection = z.infer<typeof financialSelectionSchema>;
export type FinancialCatalog = z.infer<typeof financialCatalogSchema>;
export type DimensionMatch = z.infer<typeof dimensionMatchSchema>;
export type FinancialQueryResult = z.infer<typeof financialQueryResultSchema>;
export type ActualTransactionPage = z.infer<typeof actualTransactionPageSchema>;
