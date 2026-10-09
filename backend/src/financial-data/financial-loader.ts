import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { parseFinancialActualsWorkbook } from "./financial-actual.parser";
import { parseFinancialBudgetWorkbook } from "./financial-budget.parser";
import { type FinancialGenerationInput, type FinancialGenerationResult } from "./financial-load.repository";
import { FINANCIAL_MAPPING_SEED, validateFinancialMappingSeed } from "./financial-mapping.seed";

const DATASET_KEY = "financial-chat-workbook";
const PARSER_VERSION = "financial-workbook-v1";
const SOURCE_SYSTEM = "SAP_NURSERY_WORKBOOK";

type Coverage = { plantCode: string; month: string; completeness: "confirmed" | "unconfirmed" };
type ActualMonthSum = {
  rowCount: number;
  debit: string;
  credit: string;
  actual: string;
  sourceNetRowCount: number;
  sourceNet: string;
};
type BudgetMonthSum = { rowCount: number; budget: string; rollover: string };

export interface FinancialLoadOptions {
  filePath: string;
  budgetOwner: string;
  importingActor: string;
}

export interface FinancialLoadReferences {
  plants: Array<{ id: string; code: string; sourceAliases: string[] }>;
  costCenters: Array<{ id: string; plantId: string; code: string; sourceAliases: string[] }>;
  glAccounts: Array<{ id: string; code: string; sourceAliases: string[] }>;
}

export interface FinancialReferenceSource {
  costCenters: Array<{ plantCode: string; code: string }>;
  glAccounts: Array<{ code: string; name: string }>;
}

export interface FinancialLoadDependencies {
  prepareReferences(source: FinancialReferenceSource): Promise<FinancialLoadReferences>;
  activateGeneration(input: FinancialGenerationInput): Promise<FinancialGenerationResult>;
}

export interface FinancialLoadReport {
  batchId: string;
  sourceChecksumSha256: string;
  sourceFileName: string;
  counts: { actual: number; budget: number; components: number; mappings: number };
  sourceReportingMonths: string[];
  actualCoverage: Coverage[];
  budgetCoverage: Coverage[];
  sourceSums: {
    actualByMonth: Record<string, ActualMonthSum>;
    budgetByMonth: Record<string, BudgetMonthSum>;
  };
  unknownActuals: { plant: number; costCenter: number; glAccount: number };
  unmappedActual: number;
  roundingDelta: {
    debit: string;
    credit: string;
    sourceNet: string;
    budget: string;
    rollover: string;
  };
  activated: boolean;
  idempotent: boolean;
}

export async function loadFinancialWorkbook(
  options: FinancialLoadOptions,
  dependencies: FinancialLoadDependencies,
): Promise<FinancialLoadReport> {
  if (!options.importingActor.trim()) throw new Error("Importing actor is required");
  const [buffer, sourceStat] = await Promise.all([readFile(options.filePath), stat(options.filePath)]);
  const [actual, budget] = await Promise.all([
    parseFinancialActualsWorkbook(buffer),
    parseFinancialBudgetWorkbook(buffer, options.budgetOwner),
  ]);
  const sourceSums = {
    actualByMonth: actualMonthSums(actual.lines),
    budgetByMonth: budgetMonthSums(budget.budgetRows),
  };
  assertSourceNetReconciles(sourceSums.actualByMonth, actual.validation.netMismatchCount);
  const mappings = validateFinancialMappingSeed(FINANCIAL_MAPPING_SEED, budget.components, options.budgetOwner);
  const referenceData = await dependencies.prepareReferences({
    costCenters: actual.lines.flatMap(({ sourcePlantCode, sourceCostCenterCode }) =>
      sourcePlantCode && sourceCostCenterCode ? [{ plantCode: sourcePlantCode, code: sourceCostCenterCode }] : [],
    ),
    glAccounts: [
      ...budget.budgetRows.flatMap(({ glCode }) => (glCode ? [{ code: glCode, name: glCode }] : [])),
      ...actual.lines.flatMap(({ sourceGlCode, sourceGlName }) =>
        sourceGlCode ? [{ code: sourceGlCode, name: sourceGlName ?? sourceGlCode }] : [],
      ),
    ],
  });
  const references = referenceIndex(referenceData);
  const budgetOwnerPlantId = references.plants.get(normalize(options.budgetOwner));
  if (!budgetOwnerPlantId) throw new Error("Budget owner Plant is not registered");

  const unknownActuals = { plant: 0, costCenter: 0, glAccount: 0 };
  const actuals = actual.lines.map((line) => {
    const plantId = line.sourcePlantCode ? references.plants.get(normalize(line.sourcePlantCode)) : undefined;
    const costCenterId =
      plantId && line.sourceCostCenterCode
        ? references.costCenters.get(referenceKey(plantId, line.sourceCostCenterCode))
        : undefined;
    const glAccountId = line.sourceGlCode ? references.glAccounts.get(normalize(line.sourceGlCode)) : undefined;
    if (!plantId) unknownActuals.plant += 1;
    if (!costCenterId) unknownActuals.costCenter += 1;
    if (!glAccountId) unknownActuals.glAccount += 1;
    return {
      sourceSystem: "SAP",
      transactionNumber: line.transactionNumber,
      lineId: line.lineId,
      sourceRowNumber: line.sourceRowNumber,
      postingDate: line.postingDate,
      section: line.section,
      plantId: plantId ?? null,
      costCenterId: costCenterId ?? null,
      glAccountId: glAccountId ?? null,
      sourcePlantCode: line.sourcePlantCode,
      sourceCostCenterCode: line.sourceCostCenterCode,
      sourceGlCode: line.sourceGlCode,
      sourceGlName: line.sourceGlName,
      consideration: line.consideration,
      shortName: line.shortName,
      contraAccount: line.contraAccount,
      origin: line.origin,
      location: line.location,
      debit: line.debit,
      credit: line.credit,
      lineMemo: line.lineMemo,
      comment1: line.comment1,
      comment2: line.comment2,
      reference1: line.reference1,
      sourceRow: line.sourceRow,
    };
  });

  const components = budget.components.map((component) => ({ ...component }));
  const budgets = budget.budgetRows.map((row) => ({
    plantId: budgetOwnerPlantId,
    componentKey: row.componentKey,
    reportingMonth: row.reportingMonth,
    glAccountId: row.glCode ? (references.glAccounts.get(normalize(row.glCode)) ?? null) : null,
    paymentOffice: row.paymentOffice,
    rolloverEnabled: row.rolloverEnabled,
    budgetAmount: row.budgetAmount,
    rolloverAmount: row.rolloverAmount,
    sourceRowNumber: row.sourceRowNumber,
    sourceRow: row.sourceRow,
  }));
  const mappingInputs = mappings.map((entry) => {
    const plantId = requiredReference(references.plants, entry.plantCode, "Mapping Plant is not registered");
    const costCenterId = requiredReference(
      references.costCenters,
      referenceKey(plantId, entry.costCenterCode),
      "Mapping Cost Center is not registered",
      false,
    );
    const glAccountId = requiredReference(references.glAccounts, entry.glCode, "Mapping GL is not registered");
    return {
      plantId,
      costCenterId,
      glAccountId,
      componentKey: entry.targetComponentKey,
      approvalStatus: entry.approvalStatus,
      approvalReason: entry.approvalReason,
      approvedBy: entry.approvedBy,
      provenance: { source: entry.provenance },
    };
  });
  const mappedCoordinates = new Set(
    mappingInputs.map(({ plantId, costCenterId, glAccountId }) =>
      referenceCoordinate(plantId, costCenterId, glAccountId),
    ),
  );
  const unmappedActual = actuals.filter(
    ({ plantId, costCenterId, glAccountId }) =>
      plantId !== null &&
      (costCenterId === null ||
        glAccountId === null ||
        !mappedCoordinates.has(referenceCoordinate(plantId, costCenterId, glAccountId))),
  ).length;

  const actualCoverage = observedActualCoverage(actual.lines, referenceData);
  const budgetCoverage = budget.validation.sourceReportingMonths.map((month) => ({
    plantId: budgetOwnerPlantId,
    month,
    completeness: "confirmed" as const,
  }));
  const counts = {
    actual: actuals.length,
    budget: budgets.length,
    components: components.length,
    mappings: mappingInputs.length,
  };
  const sourceChecksumSha256 = createHash("sha256").update(buffer).digest("hex");
  const generation: FinancialGenerationInput = {
    metadata: {
      datasetKey: DATASET_KEY,
      sourceSystem: SOURCE_SYSTEM,
      sourceFileName: basename(options.filePath),
      sourceChecksumSha256,
      parserVersion: PARSER_VERSION,
      mappingVersion: `mapping-master-v${MAPPING_MASTER.version}`,
      budgetOwnerPlantId,
      isSynthetic: false,
      sourceReportingMonths: actual.validation.sourceReportingMonths,
      actualCoverage,
      budgetCoverage,
      sourceCounts: counts,
      validationResult: { actual: actual.validation, budget: budget.validation, unknownActuals, unmappedActual },
      reconciliationResult: { reconciled: true, ...sourceSums },
      sourceModifiedAtUtc: sourceStat.mtime,
      importedByActor: options.importingActor.trim(),
    },
    components,
    actuals,
    budgets,
    mappings: mappingInputs,
  };
  const activation = await dependencies.activateGeneration(generation);
  return {
    batchId: activation.batchId,
    sourceChecksumSha256,
    sourceFileName: basename(options.filePath),
    counts,
    sourceReportingMonths: actual.validation.sourceReportingMonths,
    actualCoverage: actualCoverage.map(({ plantId, ...coverage }) => ({
      plantCode: requiredPlantCode(referenceData, plantId),
      ...coverage,
    })),
    budgetCoverage: budgetCoverage.map(({ plantId, ...coverage }) => ({
      plantCode: requiredPlantCode(referenceData, plantId),
      ...coverage,
    })),
    sourceSums,
    unknownActuals,
    unmappedActual,
    roundingDelta: {
      ...actual.validation.roundingDelta,
      ...budget.validation.roundingDelta,
    },
    activated: activation.activated,
    idempotent: activation.idempotent,
  };
}

function referenceIndex(references: FinancialLoadReferences): {
  plants: Map<string, string>;
  costCenters: Map<string, string>;
  glAccounts: Map<string, string>;
} {
  const plants = aliasIndex(references.plants);
  const glAccounts = aliasIndex(references.glAccounts);
  const costCenters = new Map<string, string>();
  for (const entry of references.costCenters) {
    for (const alias of [entry.code, ...entry.sourceAliases]) {
      addUnique(costCenters, referenceKey(entry.plantId, alias), entry.id);
    }
  }
  return { plants, costCenters, glAccounts };
}

function aliasIndex(entries: Array<{ id: string; code: string; sourceAliases: string[] }>): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    for (const alias of [entry.code, ...entry.sourceAliases]) addUnique(index, normalize(alias), entry.id);
  }
  return index;
}

function addUnique(index: Map<string, string>, key: string, id: string): void {
  const existing = index.get(key);
  if (existing && existing !== id) throw new Error("Financial reference alias is ambiguous");
  index.set(key, id);
}

function requiredReference(index: Map<string, string>, value: string, message: string, normalizeValue = true): string {
  const id = index.get(normalizeValue ? normalize(value) : value);
  if (!id) throw new Error(message);
  return id;
}

function observedActualCoverage(
  lines: Array<{ sourcePlantCode: string | null; reportingMonth: string }>,
  references: FinancialLoadReferences,
): Array<{ plantId: string; month: string; completeness: "unconfirmed" }> {
  const plants = aliasIndex(references.plants);
  const entries = new Map<string, { plantId: string; month: string; completeness: "unconfirmed" }>();
  for (const line of lines) {
    const plantId = line.sourcePlantCode ? plants.get(normalize(line.sourcePlantCode)) : undefined;
    if (plantId)
      entries.set(`${plantId}\0${line.reportingMonth}`, {
        plantId,
        month: line.reportingMonth,
        completeness: "unconfirmed",
      });
  }
  return [...entries.values()].sort((left, right) =>
    left.month === right.month ? left.plantId.localeCompare(right.plantId) : left.month.localeCompare(right.month),
  );
}

function actualMonthSums(
  lines: Array<{
    reportingMonth: string;
    debit: string;
    credit: string;
    actualAmount: string;
    moneyEvidence: { sourceNet: { rounded: string } | null };
  }>,
): Record<string, ActualMonthSum> {
  const sums = new Map<
    string,
    { rowCount: number; debit: bigint; credit: bigint; actual: bigint; sourceNetRowCount: number; sourceNet: bigint }
  >();
  for (const line of lines) {
    const sum = sums.get(line.reportingMonth) ?? {
      rowCount: 0,
      debit: 0n,
      credit: 0n,
      actual: 0n,
      sourceNetRowCount: 0,
      sourceNet: 0n,
    };
    sum.rowCount += 1;
    sum.debit += paise(line.debit);
    sum.credit += paise(line.credit);
    sum.actual += paise(line.actualAmount);
    if (line.moneyEvidence.sourceNet) {
      sum.sourceNetRowCount += 1;
      sum.sourceNet += paise(line.moneyEvidence.sourceNet.rounded);
    }
    sums.set(line.reportingMonth, sum);
  }
  return Object.fromEntries(
    [...sums.entries()].sort().map(([month, sum]) => [
      month,
      {
        ...sum,
        debit: money(sum.debit),
        credit: money(sum.credit),
        actual: money(sum.actual),
        sourceNet: money(sum.sourceNet),
      },
    ]),
  );
}

function assertSourceNetReconciles(actualByMonth: Record<string, ActualMonthSum>, netMismatchCount: number): void {
  if (netMismatchCount > 0) throw new Error("Workbook source net does not reconcile to Debit minus Credit");
  for (const sum of Object.values(actualByMonth)) {
    if (sum.sourceNetRowCount !== sum.rowCount || sum.sourceNet !== sum.actual) {
      throw new Error("Workbook source net does not reconcile to Debit minus Credit");
    }
  }
}

function budgetMonthSums(
  rows: Array<{ reportingMonth: string; budgetAmount: string; rolloverAmount: string }>,
): Record<string, BudgetMonthSum> {
  const sums = new Map<string, { rowCount: number; budget: bigint; rollover: bigint }>();
  for (const row of rows) {
    const sum = sums.get(row.reportingMonth) ?? { rowCount: 0, budget: 0n, rollover: 0n };
    sum.rowCount += 1;
    sum.budget += paise(row.budgetAmount);
    sum.rollover += paise(row.rolloverAmount);
    sums.set(row.reportingMonth, sum);
  }
  return Object.fromEntries(
    [...sums.entries()]
      .sort()
      .map(([month, sum]) => [month, { ...sum, budget: money(sum.budget), rollover: money(sum.rollover) }]),
  );
}

function paise(value: string): bigint {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) throw new Error("Parsed financial money is not paise precision");
  const amount = BigInt(match[2]!) * 100n + BigInt(match[3]!);
  return match[1] ? -amount : amount;
}

function money(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(3, "0");
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function requiredPlantCode(references: FinancialLoadReferences, plantId: string): string {
  const plant = references.plants.find(({ id }) => id === plantId);
  if (!plant) throw new Error("Activated coverage references an unknown Plant");
  return plant.code;
}

function referenceKey(parentId: string, code: string): string {
  return `${parentId}\0${normalize(code)}`;
}

function referenceCoordinate(plantId: string, costCenterId: string, glAccountId: string): string {
  return `${plantId}\0${costCenterId}\0${glAccountId}`;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
