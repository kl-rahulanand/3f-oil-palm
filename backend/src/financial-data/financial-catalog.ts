import {
  financialCatalogSchema,
  type FinancialCatalog,
  type FinancialDimensionId,
  type FinancialMeasureId,
} from "@3f/contract";

const ALL_MEASURES: FinancialMeasureId[] = ["actual", "budget", "rollover", "percentage"];
const ACTUAL_ONLY: FinancialMeasureId[] = ["actual"];

const dimensions: FinancialCatalog["dimensions"] = [
  dimension("plant", "Plant", "An operating Plant currently permitted to the reader.", ALL_MEASURES),
  dimension("month", "Month", "A calendar reporting month within the selected period.", ALL_MEASURES),
  dimension("gl", "GL", "A governed General Ledger account from the active generation.", ALL_MEASURES),
  dimension(
    "nursery_component",
    "Nursery component",
    "A recorded Nursery Budget component or hierarchy member.",
    ALL_MEASURES,
  ),
  dimension("cost_center", "Cost Center", "An Actual transaction Cost Center within a permitted Plant.", ACTUAL_ONLY),
  dimension("section", "Section", "An Actual transaction Section within a permitted Plant.", ACTUAL_ONLY),
  dimension("consideration", "Consideration", "An Actual transaction Consideration value.", ACTUAL_ONLY),
  dimension("short_name", "Short Name", "An Actual transaction Short Name value.", ACTUAL_ONLY),
  dimension("contra_account", "Contra Account", "An Actual transaction Contra Account value.", ACTUAL_ONLY),
  dimension("origin", "Origin", "An Actual transaction Origin value.", ACTUAL_ONLY),
  dimension("location", "Location", "An Actual transaction Location value.", ACTUAL_ONLY),
];

export const FINANCIAL_CATALOG: FinancialCatalog = financialCatalogSchema.parse({
  measures: [
    measure("actual", "Actual", "Debit minus Credit from financially valid source transaction lines."),
    measure("budget", "Budget", "Monthly Nursery Budget leaf amounts stored independently from Actual."),
    measure("rollover", "Roll-over", "Stored monthly Nursery Roll-over balances; a period uses its closing month."),
    measure("percentage", "Percentage", "Matching aggregate Actual divided by Budget when the denominator is valid."),
  ],
  dimensions,
  combinations: [
    { measureIds: ALL_MEASURES, dimensionIds: [] },
    ...dimensions.map(({ id, supportedMeasureIds }) => ({ measureIds: supportedMeasureIds, dimensionIds: [id] })),
    { measureIds: ALL_MEASURES, dimensionIds: ["plant", "month"] },
    { measureIds: ALL_MEASURES, dimensionIds: ["plant", "month", "gl"] },
    { measureIds: ALL_MEASURES, dimensionIds: ["plant", "month", "nursery_component"] },
  ],
  timeWindows: ["month", "range", "financial_ytd"],
  fiscalYearStartMonth: 4,
  limits: {
    maxAggregateRows: 199,
    maxPreparedActualScopes: 200,
    preparedTransactionRows: 10,
    defaultContinuationRows: 20,
    maxContinuationRows: 100,
  },
});

export function catalogDimension(id: FinancialDimensionId) {
  return FINANCIAL_CATALOG.dimensions.find((dimension) => dimension.id === id);
}

function measure(id: FinancialMeasureId, label: string, description: string) {
  return { id, label, description };
}

function dimension(
  id: FinancialDimensionId,
  label: string,
  description: string,
  supportedMeasureIds: FinancialMeasureId[],
) {
  return { id, label, description, supportedMeasureIds };
}
