import { Inject, Injectable, Optional } from "@nestjs/common";
import type { MisSelectionOptionsResponse, MisSelectionPeriodOption, MisSelectionRunRequest } from "@3f/contract";
import { WAREHOUSE } from "../config";
import type { Warehouse } from "../warehouse/warehouse.interface";
import {
  MAPPING_MASTER,
  MappingMasterValidationError,
  UNMAPPED_GL_LINE,
  canonicalPlantFromMaster,
  resolveMappingTriple,
  type MappingEntry,
  type MappingMaster,
  type MappingSelection,
} from "./mapping-master";
import type {
  IMultiPlantSelectionResolverService,
  MasterPlantSetResolution,
  MasterResolvedSelection,
  MasterSelectionResolution,
  ResolvedSelectionPeriod,
} from "./selection-resolver.interface";

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
export class SelectionResolverService implements IMultiPlantSelectionResolverService {
  constructor(
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    @Optional() private readonly master: MappingMaster = MAPPING_MASTER,
  ) {}

  async options(allowedPlants?: string[]): Promise<MisSelectionOptionsResponse> {
    const selections = allowedPlants
      ? this.master.selections.filter(({ plant_canonical }) => allowedPlants.includes(plant_canonical))
      : this.master.selections;
    if (selections.length === 0) return { departments: [], functions: [], plants: [], periods: [] };
    const periods = periodOptions(await this.loadedActualMonths());
    return {
      departments: unique(selections.map(({ department }) => department)),
      functions: unique(selections.map((selection) => selection.function)),
      plants: selections.map((selection) => ({
        value: selection.plant_canonical,
        label: selection.plant_aliases.display[0] ?? selection.plant_canonical,
        aliases: [selection.plant_canonical, ...selection.plant_aliases.sap, ...selection.plant_aliases.display],
        provisional: selection.provisional_labels,
        department: selection.department,
        function: selection.function,
      })),
      periods,
    };
  }

  canonicalPlant(plant: string): string | undefined {
    return canonicalPlantFromMaster(plant, this.master);
  }

  hasMapping(request: Omit<MisSelectionRunRequest, "period">): boolean {
    return this.mappingSelection(request) !== undefined;
  }

  /**
   * `knownPeriods` lets a caller that has ALREADY loaded the period list hand it back, instead of
   * this method re-running the same `ingest_batch` query. The Ask statement path validates the
   * asked period against `options()` before it gets here, so without this it paid for that query
   * twice on every statement answer. It is deliberately NOT a cache: a cached month list would go
   * stale after an ingest and offer periods that no longer exist, which is exactly the kind of
   * wrong answer this surface must not give. Passing nothing keeps the original behaviour, so
   * MIS Reports and every test fake are unaffected.
   */
  async resolve(
    request: MisSelectionRunRequest,
    knownPeriods?: MisSelectionPeriodOption[],
  ): Promise<MasterSelectionResolution> {
    const selection = this.mappingSelection(request);
    if (!selection) return { outcome: "unresolvable" };

    const available = knownPeriods ?? periodOptions(await this.loadedActualMonths());
    const period = available.find(({ value }) => value === request.period);
    if (!period) throw new SelectionPeriodUnavailableError();

    return this.resolveSelection(selection, period);
  }

  async resolvePlants(
    plants: string[],
    periodValue: string,
    knownPeriods?: MisSelectionPeriodOption[],
  ): Promise<MasterPlantSetResolution> {
    const canonical = plants.map((plant) => this.canonicalPlant(plant));
    if (canonical.some((plant) => !plant)) return { outcome: "unresolvable" };
    const canonicalPlants = unique(canonical.filter((plant): plant is string => Boolean(plant)));

    const selections = canonicalPlants.map((plant) =>
      this.master.selections.find((selection) => selection.plant_canonical === plant),
    );
    if (!selections.length || selections.some((selection) => !selection)) return { outcome: "unresolvable" };

    const available = knownPeriods ?? periodOptions(await this.loadedActualMonths());
    const period = available.find(({ value }) => value === periodValue);
    if (!period) throw new SelectionPeriodUnavailableError();

    const resolved = selections.map((selection) => this.resolveSelection(selection!, period));
    if (resolved.length === 1) return resolved[0];
    const formats = unique(resolved.map(({ misFormat }) => misFormat));
    if (formats.length !== 1) return { outcome: "unresolvable" };

    return {
      outcome: "resolved",
      plants: resolved.map(({ plant, plantDisplay, department, function: functionName, provisional }) => ({
        plant,
        plantDisplay,
        department,
        function: functionName,
        provisional,
      })),
      budgetOwnerPlant: resolved[0].budgetOwnerPlant,
      glCodes: unique(resolved.flatMap(({ glCodes }) => glCodes)),
      misFormat: formats[0],
      bucketRows: resolved.flatMap(({ bucketRows }) => bucketRows),
      triples: resolved.flatMap(({ triples }) => triples),
      leafTargets: resolved.flatMap(({ leafTargets }) => leafTargets ?? []),
      masterGlCodes: resolved[0].masterGlCodes,
      period: resolved[0].period,
    };
  }

  private resolveSelection(
    selection: MappingSelection,
    period: ResolvedSelectionPeriod & { label?: string },
  ): MasterResolvedSelection {
    const entries = resolveEntries(selection, this.master);
    return {
      outcome: "resolved",
      department: selection.department,
      function: selection.function,
      plant: selection.plant_canonical,
      plantDisplay: selection.plant_aliases.display[0] ?? selection.plant_canonical,
      provisional: selection.provisional_labels,
      budgetOwnerPlant: this.master.formats[selection.mis_format].budget_owner_plant,
      costCentres: unique(entries.map(({ cost_center }) => cost_center)),
      glCodes: unique([...entries.map(({ gl_code }) => gl_code), ...selection.budget_gl_codes]),
      misFormat: selection.mis_format,
      bucketRows: entries.filter(({ mis_line }) => mis_line === UNMAPPED_GL_LINE),
      triples: entries.map(({ cost_center, gl_code }) => ({
        plant: selection.plant_canonical,
        costCenter: cost_center,
        glCode: gl_code,
      })),
      leafTargets: entries.map(({ cost_center, gl_code, target }) => ({
        plant: selection.plant_canonical,
        costCenter: cost_center,
        glCode: gl_code,
        target: toGovernedTarget(target),
      })),
      masterGlCodes: unique(
        this.master.selections.flatMap((candidate) => [
          ...candidate.entries.map(({ gl_code }) => gl_code),
          ...candidate.budget_gl_codes,
        ]),
      ),
      period: { value: period.value, from: period.from, to: period.to },
    };
  }

  private mappingSelection(request: Omit<MisSelectionRunRequest, "period">): MappingSelection | undefined {
    const canonicalPlant = this.canonicalPlant(request.plant);
    return this.master.selections.find(
      (candidate) =>
        candidate.department === request.department &&
        candidate.function === request.function &&
        candidate.plant_canonical === canonicalPlant,
    );
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

function toGovernedTarget(target: MappingEntry["target"]) {
  if (!target) throw new MappingMasterValidationError("Mapping master selection entry has no target");
  return target.kind === "leaf" ? { kind: "leaf" as const, leafKey: target.leaf_key } : { kind: "bucket" as const };
}

function resolveEntries(selection: MappingSelection, master: MappingMaster): MappingEntry[] {
  return selection.entries.map((entry) => {
    const resolved = resolveMappingTriple(
      {
        plant: selection.plant_canonical,
        cost_center: entry.cost_center,
        gl_code: entry.gl_code,
      },
      master,
    );
    if (!resolved) throw new MappingMasterValidationError("Mapping master selection entry did not resolve");
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

export function statementPeriodOptions(periods: MisSelectionPeriodOption[]): MisSelectionPeriodOption[] {
  return periods.filter(({ from, to }) => from === to);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
