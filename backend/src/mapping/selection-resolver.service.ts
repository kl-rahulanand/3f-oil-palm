import { Inject, Injectable } from "@nestjs/common";
import type { MisSelectionOptionsResponse, MisSelectionPeriodOption, MisSelectionRunRequest } from "@3f/contract";
import { WAREHOUSE } from "../config";
import type { Warehouse } from "../warehouse/warehouse.interface";
import {
  MAPPING_MASTER,
  UNMAPPED_GL_LINE,
  canonicalPlantFromMaster,
  resolveMappingTriple,
  type MappingEntry,
  type MappingSelection,
} from "./mapping-master";
import type { ISelectionResolverService, MasterSelectionResolution } from "./selection-resolver.interface";

const FY_START = "2026-04-01";
const FY_END = "2027-03-31";
const FY_LAST_MONTH = "2027-03-01";
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;

export class SelectionPeriodUnavailableError extends Error {
  constructor() {
    super("Selection period is not available");
    this.name = "SelectionPeriodUnavailableError";
  }
}

@Injectable()
export class SelectionResolverService implements ISelectionResolverService {
  constructor(@Inject(WAREHOUSE) private readonly warehouse: Warehouse) {}

  async options(): Promise<MisSelectionOptionsResponse> {
    const periods = periodOptions(await this.loadedActualMonths());
    return {
      departments: unique(MAPPING_MASTER.selections.map(({ department }) => department)),
      functions: unique(MAPPING_MASTER.selections.map((selection) => selection.function)),
      plants: MAPPING_MASTER.selections.map((selection) => ({
        value: selection.plant_canonical,
        label: selection.plant_aliases.display[0] ?? selection.plant_canonical,
        aliases: [selection.plant_canonical, ...selection.plant_aliases.sap, ...selection.plant_aliases.display],
      })),
      periods,
    };
  }

  async resolve(request: MisSelectionRunRequest): Promise<MasterSelectionResolution> {
    const canonicalPlant = canonicalPlantFromMaster(request.plant);
    const selection = MAPPING_MASTER.selections.find(
      (candidate) =>
        candidate.department === request.department &&
        candidate.function === request.function &&
        candidate.plant_canonical === canonicalPlant,
    );
    if (!selection) return { outcome: "unresolvable" };

    const period = periodOptions(await this.loadedActualMonths()).find(({ value }) => value === request.period);
    if (!period) throw new SelectionPeriodUnavailableError();

    const entries = resolveEntries(selection);
    return {
      outcome: "resolved",
      department: selection.department,
      function: selection.function,
      plant: selection.plant_canonical,
      costCentres: unique(entries.map(({ cost_center }) => cost_center)),
      glCodes: unique([...entries.map(({ gl_code }) => gl_code), ...selection.budget_gl_codes]),
      misFormat: selection.mis_format,
      bucketRows: entries.filter(({ mis_line }) => mis_line === UNMAPPED_GL_LINE),
      triples: entries.map(({ cost_center, gl_code }) => ({
        plant: selection.plant_canonical,
        costCenter: cost_center,
        glCode: gl_code,
      })),
      masterGlCodes: unique(
        MAPPING_MASTER.selections.flatMap((candidate) => [
          ...candidate.entries.map(({ gl_code }) => gl_code),
          ...candidate.budget_gl_codes,
        ]),
      ),
      period: { value: period.value, from: period.from, to: period.to },
    };
  }

  private async loadedActualMonths(): Promise<string[]> {
    const result = await this.warehouse.execute(
      "SELECT DISTINCT period::text AS period FROM ingest_batch WHERE source_kind = 'actuals' AND is_active ORDER BY period",
    );
    return result.rows
      .map(({ period }) => period)
      .filter((period): period is string => typeof period === "string" && MONTH_PATTERN.test(period));
  }
}

function resolveEntries(selection: MappingSelection): MappingEntry[] {
  return selection.entries.map((entry) => {
    const resolved = resolveMappingTriple({
      plant: selection.plant_canonical,
      cost_center: entry.cost_center,
      gl_code: entry.gl_code,
    });
    if (!resolved) throw new Error("Mapping master selection entry did not resolve");
    return resolved;
  });
}

function periodOptions(loadedMonths: string[]): MisSelectionPeriodOption[] {
  const months = unique(loadedMonths.filter((month) => MONTH_PATTERN.test(month))).sort();
  const options = months.map((month) => ({ value: month, label: month, from: month, to: month }));
  const monthsInFy = months.filter((month) => month >= FY_START && month <= FY_LAST_MONTH);
  if (monthsInFy.length === 0) return options;

  const latest = months.at(-1)!;
  options.push({
    value: "fy26-27-ytd",
    label: "FY 26-27 YTD",
    from: FY_START,
    to: latest > FY_LAST_MONTH ? FY_END : latest,
  });
  return options;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
