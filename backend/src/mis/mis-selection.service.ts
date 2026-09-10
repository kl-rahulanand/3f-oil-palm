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
    if (!canonicalPlant || !plantScope(user).includes(canonicalPlant)) {
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
      result: execution.result,
      totals: totals(execution.totals),
      bucketRows: bucketRows(resolution, execution.result),
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
  const configured = resolution.bucketRows.map((row) => ({
    plant: resolution.plant,
    costCentre: row.cost_center,
    glCode: row.gl_code,
    misLine: row.mis_line,
    provisional: row.provisional,
    reason: row.reason ?? "Mapping review required",
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
      costCentre: null,
      glCode,
      misLine: UNMAPPED_GL_LINE,
      provisional: true,
      reason: "GL absent from Mapping Master",
    })),
  ];
}
