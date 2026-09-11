import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AuthUser,
  DomainSpec,
  MisSelectionOptionsResponse,
  MisSelectionRunRequest,
  MisSelectionRunResponse,
  MisSelectionTotals,
  ResultTable,
  Selection,
} from "@3f/contract";
import { SelectionExecutionBlockedError, SelectionExecutor } from "../chat/selectionExecutor";
import { SelectionPeriodUnavailableError, SelectionResolverService } from "../mapping/selection-resolver.service";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { UNMAPPED_GL_LINE } from "../mapping/mapping-master";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { IMisSelectionService } from "./mis-selection.interface";

const MEASURE_IDS = ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"];
const DIMENSION_IDS = ["gl_code", "month"];
const ZERO_TOTALS: MisSelectionTotals = { actual: 0, budget: 0, percentage: null };
const EMPTY_RESULT: ResultTable = {
  columns: [
    { key: "gl_code", label: "GL code", numeric: false },
    { key: "month", label: "Month", numeric: false },
    { key: "actual", label: "Actual", numeric: true },
    { key: "budget", label: "Budget", numeric: true },
    { key: "percentage", label: "%", numeric: true, format: "percent" },
  ],
  rows: [],
};

@Injectable()
export class MisSelectionService implements IMisSelectionService {
  constructor(
    @Inject(SelectionResolverService) private readonly resolver: ISelectionResolverService,
    private readonly semantic: SemanticLayer,
    private readonly executor: SelectionExecutor,
  ) {}

  options(user: AuthUser): Promise<MisSelectionOptionsResponse> {
    const { domain, selection } = this.authorizedSelection(user);
    this.executor.authorize(user, domain, selection);
    return this.resolver.options(plantScope(user));
  }

  async run(user: AuthUser, request: MisSelectionRunRequest): Promise<MisSelectionRunResponse> {
    const { domain, selection } = this.authorizedSelection(user);
    this.executor.authorize(user, domain, selection);
    const canonicalPlant = this.resolver.canonicalPlant(request.plant);
    if (canonicalPlant && !plantScope(user).includes(canonicalPlant)) {
      throw new SelectionExecutionBlockedError("governed financial plant scope is not authorized");
    }

    let resolution;
    try {
      resolution = await this.resolver.resolve(request);
    } catch (error) {
      if (error instanceof SelectionPeriodUnavailableError) throw new BadRequestException(error.message);
      throw error;
    }
    if (resolution.outcome === "unresolvable") {
      return {
        outcome: "unresolvable",
        notice: "No mapping configured",
        result: EMPTY_RESULT,
        totals: ZERO_TOTALS,
        bucketRows: [],
      };
    }

    const execution = await this.executor.run(
      user,
      domain,
      {
        ...selection,
        timeWindow: { grain: "month", from: resolution.period.from, to: resolution.period.to, column: "month" },
      },
      {
        resolvedScope: {
          triples: resolution.triples,
          glCodes: resolution.glCodes,
          masterGlCodes: resolution.masterGlCodes,
        },
      },
    );
    const result = normalizeResult(execution.result);

    return {
      outcome: "resolved",
      scope: {
        department: resolution.department,
        function: resolution.function,
        plant: resolution.plant,
        period: resolution.period.value,
        costCentres: resolution.costCentres,
        glCodes: resolution.glCodes,
        misFormat: resolution.misFormat,
      },
      result,
      totals: totals(execution.totals),
      bucketRows: bucketRows(resolution, result),
    };
  }

  private authorizedSelection(user: AuthUser): { domain: DomainSpec; selection: Selection } {
    const selection: Selection = {
      domain: "governed-financial",
      measureIds: [...MEASURE_IDS],
      dimensionIds: [...DIMENSION_IDS],
      filters: [],
    };
    const domain = this.semantic.domain(selection.domain);
    if (!domain) throw new Error("Governed financial domain is not configured");
    return { domain, selection };
  }
}

function normalizeResult(result: ResultTable): ResultTable {
  return {
    ...result,
    rows: result.rows.map((row) => ("month" in row ? { ...row, month: dateOnly(row.month) } : row)),
  };
}

function dateOnly(value: unknown): string | number | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!(value instanceof Date) && typeof value !== "string") return value as number | null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
    .join("-");
}

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}

function totals(values: Record<string, number> | undefined): MisSelectionTotals {
  return {
    actual: values?.actual ?? 0,
    budget: values?.budget ?? 0,
    percentage: values?.percentage ?? null,
  };
}

function bucketRows(resolution: MasterResolvedSelection, result: ResultTable) {
  const amounts = new Map<string, { actual: number; budget: number }>();
  for (const row of result.rows) {
    if (typeof row.gl_code !== "string") continue;
    const amount = amounts.get(row.gl_code) ?? { actual: 0, budget: 0 };
    amount.actual += Number(row.actual) || 0;
    amount.budget += Number(row.budget) || 0;
    amounts.set(row.gl_code, amount);
  }
  const grouped = new Map<string, typeof resolution.bucketRows>();
  for (const row of resolution.bucketRows) grouped.set(row.gl_code, [...(grouped.get(row.gl_code) ?? []), row]);
  const configured = [...grouped.entries()].map(([glCode, rows]) => ({
    plant: resolution.plant,
    costCentres: rows.map(({ cost_center }) => cost_center),
    glCode,
    misLine: rows[0].mis_line,
    provisional: rows.some(({ provisional }) => provisional),
    reason: rows.map(({ cost_center, reason }) => `${cost_center}: ${reason ?? "Mapping review required"}`).join("; "),
    ...(amounts.get(glCode) ?? { actual: 0, budget: 0 }),
  }));
  const configuredCodes = new Set(configured.map(({ glCode }) => glCode));
  const masterCodes = new Set(resolution.masterGlCodes);
  const dynamicCodes = result.rows
    .map(({ gl_code }) => gl_code)
    .filter((glCode): glCode is string => typeof glCode === "string" && !masterCodes.has(glCode))
    .filter((glCode, index, values) => values.indexOf(glCode) === index && !configuredCodes.has(glCode));
  return [
    ...configured,
    ...dynamicCodes.map((glCode) => ({
      plant: resolution.plant,
      costCentres: [],
      glCode,
      misLine: UNMAPPED_GL_LINE,
      provisional: true,
      reason: "GL absent from Mapping Master",
      ...(amounts.get(glCode) ?? { actual: 0, budget: 0 }),
    })),
  ];
}
