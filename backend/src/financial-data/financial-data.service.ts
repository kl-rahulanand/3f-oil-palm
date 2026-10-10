import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  actualTransactionPageSchema,
  financialQueryResultSchema,
  financialSelectionSchema,
  type ActualTransactionPage,
  type DimensionMatch,
  type FinancialCatalog,
  type FinancialDimensionId,
  type FinancialQueryResult,
  type FinancialSelection,
} from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import type { Warehouse } from "../warehouse/warehouse.interface";
import {
  ACTUAL_DRILL_CONTEXTS,
  ActualDrillContextService,
  type ActualDrillContext,
} from "./actual-drill-context.service";
import { FinancialAccessService, financialException } from "./financial-access.service";
import { ActualTransactionsRepository } from "./actual-transactions.repository";
import { FINANCIAL_CATALOG, catalogDimension } from "./financial-catalog";
import { FINANCIAL_QUERY_REPOSITORY, FinancialQueryRepository } from "./financial-query.repository";

type VocabularyRow = Record<string, string | number | null>;
type ContinuationState = { readonly limit: number; readonly lastUsedAtMs: number };

const CONTINUATION_IDLE_EXPIRY_MS = 60 * 60 * 1_000;

const VOCABULARY_SQL: Record<FinancialDimensionId, string> = {
  plant: `SELECT p.code AS value, p.name AS label, to_json(p.source_aliases)::text AS aliases,
    p.code AS plant_code FROM agent_financial.plant p`,
  month: `SELECT DISTINCT source.reporting_month::text AS value, source.reporting_month::text AS label,
    '[]' AS aliases, source.plant_code FROM (
      SELECT a.reporting_month, p.code AS plant_code FROM agent_financial.financial_actual a
      JOIN agent_financial.plant p ON p.id = a.plant_id
      JOIN agent_financial.ingestion_batch b ON b.id = a.batch_id AND b.state = 'active'
      UNION
      SELECT n.reporting_month, p.code AS plant_code FROM agent_financial.nursery_budget n
      JOIN agent_financial.plant p ON p.id = n.plant_id
      JOIN agent_financial.ingestion_batch b ON b.id = n.batch_id AND b.state = 'active'
    ) source`,
  gl: `SELECT DISTINCT g.code AS value, g.name AS label, to_json(g.source_aliases)::text AS aliases,
    p.code AS plant_code FROM agent_financial.financial_actual a
    JOIN agent_financial.plant p ON p.id = a.plant_id
    JOIN agent_financial.gl_account g ON g.id = a.gl_account_id
    JOIN agent_financial.ingestion_batch b ON b.id = a.batch_id AND b.state = 'active'
    UNION
    SELECT DISTINCT g.code AS value, g.name AS label, to_json(g.source_aliases)::text AS aliases,
    p.code AS plant_code FROM agent_financial.nursery_budget n
    JOIN agent_financial.plant p ON p.id = n.plant_id
    JOIN agent_financial.gl_account g ON g.id = n.gl_account_id
    JOIN agent_financial.ingestion_batch b ON b.id = n.batch_id AND b.state = 'active'`,
  cost_center: `SELECT DISTINCT c.code AS value, c.name AS label, to_json(c.source_aliases)::text AS aliases,
    p.code AS plant_code FROM agent_financial.financial_actual a
    JOIN agent_financial.cost_center c ON c.id = a.cost_center_id
    JOIN agent_financial.plant p ON p.id = a.plant_id
    JOIN agent_financial.ingestion_batch b ON b.id = a.batch_id AND b.state = 'active'`,
  nursery_component: `SELECT DISTINCT c.component_key AS value, c.component_name AS label, '[]' AS aliases,
    p.code AS plant_code FROM agent_financial.nursery_budget_component c
    JOIN agent_financial.ingestion_batch b ON b.id = c.batch_id AND b.state = 'active'
    JOIN agent_financial.plant p ON p.id = b.budget_owner_plant_id`,
  section: actualTextDimension("section"),
  consideration: actualTextDimension("consideration"),
  short_name: actualTextDimension("short_name"),
  contra_account: actualTextDimension("contra_account"),
  origin: actualTextDimension("origin"),
  location: actualTextDimension("location"),
};

@Injectable()
export class FinancialDataService {
  private readonly vocabularyLimit = loadConfig().dimensionEnumMax;
  private readonly continuationStates = new Map<string, ContinuationState>();
  private readonly transactionLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly access: FinancialAccessService,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    @Optional()
    @Inject(FINANCIAL_QUERY_REPOSITORY)
    private readonly queryRepository: Pick<
      FinancialQueryRepository,
      "queryWithDrillScopes"
    > = new FinancialQueryRepository(),
    @Optional()
    @Inject(ACTUAL_DRILL_CONTEXTS)
    private readonly drillContexts: ActualDrillContextService = new ActualDrillContextService(),
    @Optional()
    private readonly actualTransactions: ActualTransactionsRepository = new ActualTransactionsRepository(),
  ) {}

  async getCatalog(userId: string): Promise<FinancialCatalog> {
    await this.access.authorize(userId, { kind: "catalog" });
    return structuredClone(FINANCIAL_CATALOG);
  }

  async findValues(userId: string, dimensionId: FinancialDimensionId, search: string): Promise<DimensionMatch[]> {
    const dimension = catalogDimension(dimensionId);
    if (!dimension) throw financialException("unsupported_selection");
    const authorized = await this.access.authorize(userId, { kind: "dimension_lookup", dimensionId });
    const result = await this.warehouse.execute(VOCABULARY_SQL[dimensionId]);
    const permitted = new Set(authorized.plantIds);
    const needle = search.trim().toLocaleLowerCase();
    const matches = new Map<string, DimensionMatch>();
    for (const row of result.rows as VocabularyRow[]) {
      if (!permitted.has(String(row.plant_code ?? ""))) continue;
      const value = String(row.value ?? "").trim();
      const label = String(row.label ?? "").trim();
      if (!value || !label) continue;
      const aliases = parseAliases(row.aliases);
      if (needle && ![value, label, ...aliases].some((candidate) => candidate.toLocaleLowerCase().includes(needle))) {
        continue;
      }
      matches.set(value, { dimensionId, value, label, aliases });
      if (matches.size === this.vocabularyLimit) break;
    }
    return [...matches.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  async assertSelectionSupported(userId: string, input: FinancialSelection): Promise<FinancialSelection> {
    const parsed = financialSelectionSchema.safeParse(input);
    if (!parsed.success) throw financialException("unsupported_selection");
    const authorized = await this.access.authorize(userId, { kind: "selection" });
    if (parsed.data.plantIds.some((plantId) => !authorized.plantIds.includes(plantId))) {
      throw financialException("access_denied");
    }
    const isCatalogCombination = FINANCIAL_CATALOG.combinations.some(
      (combination) =>
        sameIds(combination.dimensionIds, parsed.data.dimensionIds) &&
        parsed.data.measureIds.every((measureId) => combination.measureIds.includes(measureId)),
    );
    if (!isCatalogCombination) throw financialException("unsupported_selection");
    for (const dimensionId of [
      ...parsed.data.dimensionIds,
      ...parsed.data.filters.map((filter) => filter.dimensionId),
    ]) {
      const supported = catalogDimension(dimensionId)?.supportedMeasureIds ?? [];
      if (parsed.data.measureIds.some((measureId) => !supported.includes(measureId))) {
        throw financialException("unsupported_selection");
      }
    }
    return parsed.data;
  }

  async query(userId: string, input: FinancialSelection): Promise<FinancialQueryResult> {
    const selection = await this.assertSelectionSupported(userId, input);
    const execution = await this.queryRepository.queryWithDrillScopes(selection);
    const handles = this.drillContexts.issue(userId, execution.result.resultId, execution.drillCandidates);
    return replaceDrillHandles(execution.result, handles);
  }

  async resolveActualDrillScope(userId: string, drilldownId: string): Promise<ActualDrillContext> {
    const authorized = await this.access.authorize(userId, { kind: "selection" });
    return this.drillContexts.resolve(userId, drilldownId, authorized.plantIds);
  }

  async transactions(
    userId: string,
    drilldownId: string,
    page: number,
    limit?: number,
  ): Promise<ActualTransactionPage> {
    const context = await this.resolveActualDrillScope(userId, drilldownId);
    const lastUsedAtMs = Date.parse(context.lastUsedAtUtc);
    this.pruneContinuationStates(lastUsedAtMs);
    return this.withTransactionLock(drilldownId, () =>
      this.readTransactionPage(context, drilldownId, page, limit, lastUsedAtMs),
    );
  }

  private async readTransactionPage(
    context: ActualDrillContext,
    drilldownId: string,
    page: number,
    limit: number | undefined,
    lastUsedAtMs: number,
  ): Promise<ActualTransactionPage> {
    const pinnedLimit = this.continuationStates.get(drilldownId)?.limit;
    const pageLimit = validatedPageLimit(page, limit, pinnedLimit);
    const summary = await this.actualTransactions.summarize(context.scope);
    if (!summary) throw sourceUnavailable();
    if (summary.matchingActualTotal !== context.expectedMatchingActualTotal) throw detailMismatch();

    const continuationLimit = page === 1 ? (pinnedLimit ?? 20) : pageLimit;
    const totalPages = 1 + Math.ceil(Math.max(summary.totalItems - 10, 0) / continuationLimit);
    if (page > totalPages) throw pageOutOfRange();
    const offset = page === 1 ? 0 : 10 + (page - 2) * pageLimit;
    const transactions = await this.actualTransactions.page(context.scope, offset, pageLimit);
    if (page >= 2 || pinnedLimit !== undefined) {
      this.continuationStates.set(drilldownId, { limit: pinnedLimit ?? pageLimit, lastUsedAtMs });
    }

    return actualTransactionPageSchema.parse({
      drilldownId,
      transactions,
      page,
      limit: pageLimit,
      totalItems: summary.totalItems,
      totalPages,
      matchingActualTotal: summary.matchingActualTotal,
      preparedSize: 10,
      defaultContinuationLimit: 20,
      pinnedContinuationLimit: this.continuationStates.get(drilldownId)?.limit ?? null,
    });
  }

  private async withTransactionLock<T>(drilldownId: string, read: () => Promise<T>): Promise<T> {
    const preceding = this.transactionLocks.get(drilldownId) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = preceding.then(() => current);
    this.transactionLocks.set(drilldownId, tail);
    await preceding;
    try {
      return await read();
    } finally {
      release();
      if (this.transactionLocks.get(drilldownId) === tail) this.transactionLocks.delete(drilldownId);
    }
  }

  private pruneContinuationStates(now: number): void {
    for (const [drilldownId, state] of this.continuationStates) {
      if (!this.transactionLocks.has(drilldownId) && now - state.lastUsedAtMs >= CONTINUATION_IDLE_EXPIRY_MS) {
        this.continuationStates.delete(drilldownId);
      }
    }
  }
}

function validatedPageLimit(page: number, limit: number | undefined, pinnedLimit: number | undefined): number {
  const fieldErrors: Array<{ field: string; reason: string }> = [];
  if (!Number.isInteger(page) || page < 1) fieldErrors.push({ field: "page", reason: "must be an integer from 1" });
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    fieldErrors.push({ field: "limit", reason: "must be an integer from 1 to 100" });
  }
  if (page === 1 && limit !== 10) fieldErrors.push({ field: "limit", reason: "page 1 uses 10 rows" });
  if (fieldErrors.length) throw invalidPagination(fieldErrors);
  const requested = limit ?? pinnedLimit ?? 20;
  if (page >= 2 && pinnedLimit !== undefined && requested !== pinnedLimit) throw pageSizeChanged(pinnedLimit);
  return requested;
}

function invalidPagination(fieldErrors: Array<{ field: string; reason: string }>): BadRequestException {
  return new BadRequestException({
    message: "Use valid transaction page and limit values.",
    details: { reason: "invalid_pagination", fieldErrors },
  });
}

function pageSizeChanged(pinnedContinuationLimit: number): BadRequestException {
  return new BadRequestException({
    message: "Continue with the transaction page size already in use.",
    details: { reason: "page_size_changed", pinnedContinuationLimit },
  });
}

function pageOutOfRange(): BadRequestException {
  return new BadRequestException({
    message: "That transaction page does not exist. Return to the available pages.",
    details: { reason: "page_out_of_range" },
  });
}

function detailMismatch(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: "Transaction details no longer match the financial result. Run the question again.",
    details: { reason: "detail_mismatch" },
  });
}

function sourceUnavailable(): GoneException {
  return new GoneException({
    message: "The transaction source is no longer available. Run the financial question again.",
    details: { reason: "source_unavailable" },
  });
}

function replaceDrillHandles(result: FinancialQueryResult, handles: ReadonlyMap<string, string>): FinancialQueryResult {
  const replaced = structuredClone(result);
  for (const values of [replaced.totals, ...replaced.rows.map(({ values }) => values)]) {
    if (values.actual?.state === "available") {
      values.actual.drilldownId = requiredHandle(handles, values.actual.drilldownId);
    }
    if (values.availableActualSubtotal) {
      values.availableActualSubtotal.drilldownId = requiredHandle(handles, values.availableActualSubtotal.drilldownId);
    }
  }
  return financialQueryResultSchema.parse(replaced);
}

function requiredHandle(handles: ReadonlyMap<string, string>, provisionalId: string): string {
  const handle = handles.get(provisionalId);
  if (!handle) throw new Error("Financial query returned an unregistered Actual drill scope");
  return handle;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function actualTextDimension(column: string): string {
  return `SELECT DISTINCT a.${column} AS value, a.${column} AS label, '[]' AS aliases,
    p.code AS plant_code FROM agent_financial.financial_actual a
    JOIN agent_financial.plant p ON p.id = a.plant_id
    JOIN agent_financial.ingestion_batch b ON b.id = a.batch_id AND b.state = 'active'
    WHERE a.${column} IS NOT NULL`;
}

function parseAliases(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((alias): alias is string => typeof alias === "string") : [];
  } catch {
    return [];
  }
}
