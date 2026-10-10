import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  financialSelectionSchema,
  type DimensionMatch,
  type FinancialCatalog,
  type FinancialDimensionId,
  type FinancialQueryResult,
  type FinancialSelection,
} from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { FinancialAccessService, financialException } from "./financial-access.service";
import { FINANCIAL_CATALOG, catalogDimension } from "./financial-catalog";
import { FINANCIAL_QUERY_REPOSITORY, FinancialQueryRepository } from "./financial-query.repository";

type VocabularyRow = Record<string, string | number | null>;

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

  constructor(
    private readonly access: FinancialAccessService,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    @Optional()
    @Inject(FINANCIAL_QUERY_REPOSITORY)
    private readonly queryRepository: Pick<FinancialQueryRepository, "query"> = new FinancialQueryRepository(),
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
    return this.queryRepository.query(selection);
  }
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
