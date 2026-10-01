import { Inject, Injectable } from "@nestjs/common";
import {
  ResponseClass,
  type AskPeriodControl,
  type AskPeriodOption,
  type AskPriorTurn,
  type AskReportGrounding,
  type AskStatementGrounding,
  type AskResponse,
  type AuthUser,
  type ChatStreamEvent,
  type Chip,
  type DomainSpec,
  type MeasureSpec,
  type Permissions,
  type Provenance,
  type ResultTable,
  type Selection,
} from "@3f/contract";
import { LLM_PROVIDER, loadConfig } from "../config";
import { LLM_CONTEXT_CHAR_BUDGET } from "../llm/llm.constants";
import type { LlmPriorTurn, LlmProvider, LlmUsage } from "../llm/llm.interface";
import { SemanticLayer } from "../semantic/semanticLayer";
import { AuditService } from "../core/audit.service";
import { DimensionValuesService } from "../core/dimension-values.service";
import { ReportsService } from "../reports/reports.service";
import { HelpService } from "../help/help.service";
import {
  SelectionPeriodUnavailableError,
  SelectionResolverService,
  statementPeriodOptions,
} from "../mapping/selection-resolver.service";
import type { MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { classifyMeta, glossaryLookup, unsupportedFallbackMessage } from "../help/glossary";
import { CHAT_MESSAGES } from "./chat.constants";
import { domainRoutingAmbiguity, requiredTimeWindowClarify } from "./ambiguity";
import { chooseChart } from "./chartChooser";
import { classifyCausalQuestion, classifyReconciliationQuestion } from "./reconciliation-guard";
import { classifySmalltalk } from "./smalltalk-guard";
import { parseTimeWindow } from "./timeWindowParse";
import { StatementExplanationService } from "./statement-explanation.service";
import {
  type AppliedTimeWindow,
  SelectionExecutionBlockedError,
  SelectionExecutor,
  resolveSelectionTimeWindow,
} from "./selectionExecutor";

/**
 * The orchestration brain (pipeline skeleton). Flow:
 *   route/allow -> LLM SELECT -> validate selection -> build SQL (+RBAC) ->
 *   audit-before-execute (fail-closed) -> validate SQL -> EXPLAIN -> execute -> format.
 * Every exit maps to a typed ResponseClass; nothing fabricates on failure.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly semantic: SemanticLayer,
    private readonly selectionExecutor: SelectionExecutor,
    private readonly audit: AuditService,
    private readonly dimensionValues: DimensionValuesService,
    private readonly reports: ReportsService,
    private readonly help: HelpService,
    private readonly selectionResolver: SelectionResolverService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly statementExplanation: StatementExplanationService,
  ) {}

  async ask(
    user: AuthUser,
    sessionId: string,
    question: string,
    editedSelection?: Selection,
    reportGrounding?: AskReportGrounding,
    clientPriorTurns?: AskPriorTurn[],
    onEvent?: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
    statementGrounding?: AskStatementGrounding,
  ): Promise<AskResponse> {
    const started = Date.now();
    const cfg = loadConfig();
    let usedPriorContext = false;
    let llmUsage: LlmUsage | undefined;
    const done = (
      r: Omit<AskResponse, "sessionId" | "latencyMs" | "viewInReport"> & {
        viewInReport?: AskResponse["viewInReport"];
      },
    ): AskResponse => {
      const res: AskResponse = {
        ...r,
        viewInReport: r.viewInReport ?? {
          available: false,
          reason: "This response cannot be opened in the MIS statement.",
        },
        usedPriorContext,
        sessionId,
        latencyMs: Date.now() - started,
      };
      void this.audit.writeResultEvent({
        userId: user.id,
        sessionId,
        responseClass: res.responseClass,
        latencyMs: res.latencyMs!,
        ...(llmUsage ? { usage: llmUsage } : {}),
      });
      return res;
    };

    try {
      await this.audit.writeRequestEvent({ userId: user.id, sessionId, question });
    } catch {
      return done({ responseClass: ResponseClass.BackendError, message: CHAT_MESSAGES.auditNotRecorded });
    }
    if (statementGrounding) {
      const explanation = await this.statementExplanation.explain(user, sessionId, question, statementGrounding);
      if (explanation.kind === "causal") {
        const causal = classifyCausalQuestion(question) ?? classifyCausalQuestion("why");
        return done({ responseClass: ResponseClass.Informational, kind: "informational", ...causal! });
      }
      if (explanation.kind === "response") {
        const grounding = explanation.response;
        return done({
          responseClass:
            grounding.outcome === "leaf" || grounding.outcome === "replaced" || grounding.outcome === "aggregate"
              ? ResponseClass.Success
              : grounding.outcome === "audit-failure"
                ? ResponseClass.BackendError
                : ResponseClass.BlockedByPolicy,
          message:
            grounding.outcome === "focus-required"
              ? "Click an Actual in the statement first."
              : grounding.outcome === "audit-failure" || grounding.outcome === "gone"
                ? grounding.message
                : undefined,
          statementGrounding: grounding,
        });
      }
    }
    onEvent?.({ type: "phase", phase: "routing" });
    const allowed = this.semantic.allowedFor(user.permissions);
    if (allowed.length === 0)
      return done({
        responseClass: ResponseClass.BlockedByPolicy,
        message: CHAT_MESSAGES.noAccessibleDomains,
      });
    const termIndex = () => this.help.buildIndex(user);
    if (!editedSelection && !reportGrounding && classifyMeta(question)) {
      const lookup = glossaryLookup(question, await termIndex());
      if (lookup) {
        return done({
          responseClass: ResponseClass.Informational,
          kind: "informational",
          ...lookup,
        });
      }
    }
    if (!editedSelection && !reportGrounding) {
      const reconcile = classifyReconciliationQuestion(question);
      if (reconcile) {
        return done({
          responseClass: ResponseClass.Informational,
          kind: "informational",
          ...reconcile,
        });
      }
      const causal = classifyCausalQuestion(question);
      if (causal) {
        return done({ responseClass: ResponseClass.Informational, kind: "informational", ...causal });
      }
    }
    if (!editedSelection && !reportGrounding) {
      const smalltalk = classifySmalltalk(question);
      if (smalltalk) {
        return done({ responseClass: ResponseClass.Informational, kind: "informational", ...smalltalk });
      }
    }

    const groundedReport = reportGrounding
      ? this.reports.resolveAuthorizedSelection(user, reportGrounding.reportId, reportGrounding.timeWindow)
      : undefined;
    const usesEditedSelection = Boolean(editedSelection && !groundedReport);
    const groundingPriorTurn = groundedReport
      ? {
          question: groundedReport.report.title,
          selection: cloneSelection(groundedReport.selection),
        }
      : undefined;

    const priorTurns: LlmPriorTurn[] = trimPriorTurnsToTokenBudget([
      ...(clientPriorTurns ?? []),
      ...(groundingPriorTurn ? [groundingPriorTurn] : []),
    ]);
    const priorSelection = priorTurns.at(-1)?.selection;

    // 1. Selection: use the user's edited chips, else ask the LLM to select.
    onEvent?.({ type: "phase", phase: "selecting" });
    let selection: Selection;
    if (usesEditedSelection && editedSelection) {
      selection = editedSelection;
    } else {
      usedPriorContext = priorTurns.length > 0;
      const llmAllowedDomains = groundedReport
        ? [domainScopedToReport(groundedReport.domain, groundedReport.selection)]
        : allowed;
      const comparableMeasureIdsByDomain = Object.fromEntries(
        allowed.map((domain) => [
          domain.name,
          domain.measures.filter((measure) => measure.format === "money").map((measure) => measure.id),
        ]),
      );
      const dimensionValues = await this.dimensionValuesForAllowedDomains(llmAllowedDomains, cfg.dimensionEnumMax);
      signal?.throwIfAborted();
      const sel = await this.llm.select(
        {
          question,
          allowedDomains: llmAllowedDomains,
          comparableMeasureIdsByDomain,
          ...(priorTurns.length > 0 ? { priorTurns } : {}),
          dimensionValues,
        },
        signal,
      );
      signal?.throwIfAborted();
      llmUsage = sel.usage;
      if (sel.kind === "clarify") {
        const clarify = {
          prompt: sel.prompt,
          options: sel.options,
          defaultOption: sel.defaultOption,
          resumesQuestion: false,
        };
        return done({
          responseClass: ResponseClass.ClarificationNeeded,
          clarify,
        });
      }
      if (sel.kind === "unsupported") {
        const index = await termIndex();
        const lookup = glossaryLookup(question, index);
        if (lookup) {
          return done({
            responseClass: ResponseClass.Informational,
            kind: "informational",
            ...lookup,
          });
        }
        return done({
          responseClass: ResponseClass.NotSupported,
          message: unsupportedFallbackMessage(index),
        });
      }
      if (sel.kind === "no_tool_block" || sel.kind === "backend_error") {
        return done({ responseClass: ResponseClass.BackendError, message: sel.reason });
      }
      selection = sel.selection;
      if (groundedReport) {
        const groundedSelection = applyReportGroundingToSelection(selection, groundedReport.selection);
        if (!groundedSelection) {
          return done({
            responseClass: ResponseClass.NotSupported,
            message: CHAT_MESSAGES.reportGroundingSelectionMismatch,
          });
        }
        selection = groundedSelection;
      }
      const routingClarify = domainRoutingAmbiguity({
        question,
        allowedDomains: llmAllowedDomains,
        chosenDomain: selection.domain,
      });
      if (routingClarify)
        return done({
          responseClass: ResponseClass.ClarificationNeeded,
          clarify: routingClarify,
        });
    }

    // Prompt topicality is best-effort; the enforceable boundary is that every emitted id
    // must belong to the registered semantic catalog and the caller's permissions.
    // 2. Validate the selection against the semantic layer AND the user's permissions.
    const domain = this.semantic.domain(selection.domain);
    if (!domain || !user.permissions.domains.includes(selection.domain))
      return done({
        responseClass: ResponseClass.NotSupported,
        message: CHAT_MESSAGES.unknownOrNotPermittedDomain,
      });
    for (const m of selection.measureIds)
      if (!this.semantic.measure(selection.domain, m) || !user.permissions.measureIds.includes(m))
        return done({
          responseClass: ResponseClass.NotSupported,
          message: CHAT_MESSAGES.measureNotAvailable(m),
        });
    for (const d of selection.dimensionIds)
      if (!this.semantic.dimension(selection.domain, d) || !user.permissions.dimensionIds.includes(d))
        return done({
          responseClass: ResponseClass.NotSupported,
          message: CHAT_MESSAGES.dimensionNotAvailable(d),
        });

    // 3. Fail-closed row scope: a row-scoped domain requires the user to have a scope value.
    if (domain.scopeColumn && domain.name !== "mis-statement") {
      const hasScope = user.scope.some((s) => s.attribute === domain.scopeColumn);
      if (!hasScope)
        return done({
          responseClass: ResponseClass.BlockedByPolicy,
          message: CHAT_MESSAGES.noDataScopeAssigned,
        });
    }

    const normalizedSelection = await this.normalizeFilterValues(selection, domain, cfg.dimensionEnumMax);
    if (normalizedSelection.kind === "clarify")
      return done({
        responseClass: ResponseClass.ClarificationNeeded,
        clarify: normalizedSelection.clarify,
      });
    selection = normalizedSelection.selection;
    if (selection.timeWindow?.from && selection.timeWindow.to && selection.timeWindow.from > selection.timeWindow.to)
      return done({
        responseClass: ResponseClass.NotSupported,
        message: CHAT_MESSAGES.invalidDateRange,
      });
    // Follow-up inheritance: if this turn is a follow-up in the same conversation whose
    // prior selection had a time window, and the current time-bound selection did not,
    // carry the previous window forward instead of re-asking for it.
    if (!selection.timeWindow && priorSelection?.timeWindow && priorSelection.domain === selection.domain) {
      const usesTimeBoundMeasure = selection.measureIds
        .map((id) => this.semantic.measure(selection.domain, id))
        .some((measure) => measure?.requiresTimeWindow === true);
      if (usesTimeBoundMeasure) {
        selection = { ...selection, timeWindow: priorSelection.timeWindow };
      }
    }
    let resolved = resolveSelectionTimeWindow(domain, selection);
    selection = resolved.selection;
    let appliedTimeWindow = resolved.appliedTimeWindow;
    // Deterministic fallback: if the LLM produced no usable time window (none at all, or a
    // partial one that didn't resolve), parse it from the question text ("last 30 days",
    // "since 1 january", "2026-01-01 to 2026-07-09", "Jan-Mar 2026", ...) instead of
    // re-asking. This keeps time-window clarify answers from looping through the LLM.
    if (!appliedTimeWindow) {
      const parsedTimeWindow = parseTimeWindow(question, new Date());
      if (parsedTimeWindow) {
        selection = { ...selection, timeWindow: parsedTimeWindow };
        resolved = resolveSelectionTimeWindow(domain, selection);
        selection = resolved.selection;
        appliedTimeWindow = resolved.appliedTimeWindow;
      }
    }
    const selectedMeasures = selection.measureIds
      .map((id) => this.semantic.measure(selection.domain, id))
      .filter((measure): measure is MeasureSpec => Boolean(measure));
    const timeWindowClarify = requiredTimeWindowClarify({ selectedMeasures, appliedTimeWindow });
    if (timeWindowClarify)
      return done({
        responseClass: ResponseClass.ClarificationNeeded,
        clarify: timeWindowClarify,
      });

    let statementScope: MasterResolvedSelection | undefined;
    let answerPeriodOptions: AskPeriodOption[] | undefined;
    if (domain.name === "mis-statement") {
      const request = await statementRequest(
        user,
        appliedTimeWindow,
        selectedMeasures.find(({ timeColumn }) => timeColumn)?.timeColumn ?? "month",
        this.selectionResolver,
      );
      if (request.kind === "scope")
        return done({
          responseClass: ResponseClass.BlockedByPolicy,
          message: CHAT_MESSAGES.statementScope(request.attribute),
        });
      if (request.kind === "no-mapping")
        return done({ responseClass: ResponseClass.NotSupported, message: CHAT_MESSAGES.statementMappingMissing });
      if (request.kind === "no-periods")
        return done({ responseClass: ResponseClass.NotSupported, message: CHAT_MESSAGES.statementPeriodsMissing });
      if (request.kind === "period")
        return done({
          responseClass: ResponseClass.ClarificationNeeded,
          message: CHAT_MESSAGES.statementPeriodPrompt,
          periodChoice: {
            prompt: CHAT_MESSAGES.statementPeriodPrompt,
            selection: withoutTimeWindow(selection),
            question,
            options: request.options,
          },
        });
      statementScope = request.resolution;
      answerPeriodOptions = request.options;
    }

    let sql: string;
    let result: ResultTable;
    let totals: Record<string, number> | undefined;
    let activeBatchIds: NonNullable<Provenance["activeBatchIds"]> = [];
    let budgetComponentLabels: string[] = [];
    let rowSourcePresence: NonNullable<Provenance["rowSourcePresence"]> = [];
    let auditFailed = false;

    onEvent?.({ type: "phase", phase: "querying" });
    try {
      const execution = await this.selectionExecutor.run(user, domain, selection, {
        signal,
        ...(statementScope
          ? {
              resolvedScope: {
                triples: statementScope.triples,
                glCodes: statementScope.glCodes,
                masterGlCodes: statementScope.masterGlCodes,
                leafTargets: statementScope.leafTargets,
              },
            }
          : {}),
        beforeExecute: async (built) => {
          try {
            await this.audit.writeRequestEvent({
              userId: user.id,
              sessionId,
              question,
              selection: built.selection,
              generatedSql: built.sql,
              objectsTouched: built.objectsTouched,
            });
          } catch {
            auditFailed = true;
            throw new Error(CHAT_MESSAGES.auditNotRecorded);
          }
        },
      });
      result = execution.result;
      totals = execution.totals;
      sql = execution.sql;
      activeBatchIds = execution.activeBatchIds;
      budgetComponentLabels = execution.budgetComponentLabels;
      rowSourcePresence = execution.rowSourcePresence;
      signal?.throwIfAborted();
      // `numeric` means "value/measure column" for rendering (chart axis, headline,
      // alignment) — NOT the raw SQL type. An integer DIMENSION (e.g. activity_hour
      // 0-23) is categorical here, so classify columns by measure-role, not warehouse type.
    } catch (e) {
      if (signal?.aborted) throw signal.reason;
      if (auditFailed) {
        return done({
          responseClass: ResponseClass.BackendError,
          message: CHAT_MESSAGES.auditNotRecorded,
        });
      }
      if (e instanceof SelectionExecutionBlockedError) {
        return done({
          responseClass: ResponseClass.BlockedByPolicy,
          message: CHAT_MESSAGES.queryBlocked(e.message),
        });
      }
      if (isBuildError(e)) {
        return done({ responseClass: ResponseClass.BackendError, message: (e as Error).message });
      }
      return done({ responseClass: ResponseClass.ExecutionFailed, message: (e as Error).message });
    }

    // 8. Format + provenance. Persist the successful answer in the durable conversation.
    onEvent?.({ type: "phase", phase: "summarizing" });
    const impliedFilters = selectedMeasures.flatMap((measure) => measure.impliedFilters);
    const scope = user.scope.map((s) => `${s.attribute}=${s.value}`).join(", ") || "all permitted";
    const provenance: Provenance = {
      verified: isVerifiedSelection(selection, (domainName, measureId) => this.semantic.measure(domainName, measureId)),
      measureIds: selection.measureIds,
      measures: selectedMeasures.map((measure) => ({
        id: measure.id,
        label: measure.label,
        expr: measure.expr,
        grain: measure.grain,
        impliedFilters: measure.impliedFilters,
      })),
      impliedFilters,
      scope,
      readback: buildReadback(domain, selection, selectedMeasures, appliedTimeWindow, scope),
      dataAsOf: await this.selectionExecutor.freshness(domain).catch(() => null),
      sql,
      activeBatchIds,
      budgetComponentLabels,
      rowSourcePresence,
    };
    const resultColumnKeys = new Set(result.columns.map((column) => column.key));
    const timeKeys = domain.dimensions
      .filter((dimension) => resultColumnKeys.has(dimension.id))
      .filter((dimension) => isTimeDimension(domain, dimension.id, selection.measureIds))
      .map((dimension) => dimension.id);
    const chart = chooseChart(result, { timeKeys, hint: question });
    const availableFields = await this.availableFieldsForAnswer(domain, user.permissions, cfg.dimensionEnumMax);
    const answerMetadata = {
      chartType: chart.chartType,
      availableChartTypes: chart.availableChartTypes,
      availableFields,
    };
    answerPeriodOptions ??= askPeriodOptions(
      (await this.selectionResolver.options()).periods,
      appliedTimeWindow?.column ?? selectedMeasures.find(({ timeColumn }) => timeColumn)?.timeColumn ?? "month",
    );

    const successResponse: Omit<AskResponse, "sessionId" | "latencyMs"> = {
      responseClass: ResponseClass.Success,
      usedPriorContext,
      title: this.title(domain.label, selection),
      chips: this.chips(selection),
      // The fully-resolved selection (post normalize + time-window) so the client can
      // save/pin/edit it and re-run deterministically (H1/I1). Never SQL — just the selection.
      selection,
      result,
      ...(totals ? { totals } : {}),
      provenance,
      appliedTimeWindow,
      appliedFilters: selection.filters,
      periodControl: buildPeriodControl(selection, appliedTimeWindow, answerPeriodOptions),
      viewInReport: buildViewInReport(domain, statementScope, activeBatchIds),
      ...answerMetadata,
    };

    onEvent?.({ type: "token", text: provenance.readback });
    return done(successResponse);
  }

  private chips(sel: Selection): Chip[] {
    const chips: Chip[] = sel.measureIds.map((id) => ({ kind: "measure", id, label: id.split(".").pop()! }));
    for (const d of sel.dimensionIds) chips.push({ kind: "dimension", id: d, label: d });
    if (sel.timeWindow)
      chips.push({
        kind: "timeWindow",
        id: "time",
        label: `last ${sel.timeWindow.last ?? ""} ${sel.timeWindow.grain}`,
      });
    return chips;
  }

  private title(domainLabel: string, sel: Selection): string {
    return `${sel.measureIds.map((m) => m.split(".").pop()).join(", ")} — ${domainLabel}`;
  }

  private async dimensionValuesForAllowedDomains(
    allowedDomains: DomainSpec[],
    maxValues: number,
  ): Promise<Record<string, string[]> | undefined> {
    const valuesByDimension: Record<string, string[]> = {};
    for (const domain of allowedDomains) {
      for (const dimension of domain.dimensions) {
        const values = await this.dimensionValues.values(domain.goldObject, dimension.column);
        if (values.length > 0 && values.length <= maxValues) {
          valuesByDimension[dimension.id] = values;
        }
      }
    }
    return Object.keys(valuesByDimension).length > 0 ? valuesByDimension : undefined;
  }

  private async availableFieldsForAnswer(
    domain: DomainSpec,
    permissions: Permissions,
    maxValues: number,
  ): Promise<AvailableFields> {
    const availableFields = availableFieldsForDomain(domain, permissions);
    const dimensions: AvailableFields["dimensions"] = [];

    for (const field of availableFields.dimensions) {
      const dimension = domain.dimensions.find((candidate) => candidate.id === field.id);
      if (!dimension) {
        dimensions.push(field);
        continue;
      }

      try {
        const values = await this.dimensionValues.values(domain.goldObject, dimension.column);
        dimensions.push(values.length > 0 && values.length <= maxValues ? { ...field, values } : field);
      } catch {
        dimensions.push(field);
      }
    }

    return { ...availableFields, dimensions };
  }

  private async normalizeFilterValues(
    selection: Selection,
    domain: DomainSpec,
    maxValues: number,
  ): Promise<
    | { kind: "selection"; selection: Selection }
    | {
        kind: "clarify";
        clarify: { prompt: string; options: string[]; defaultOption?: string; resumesQuestion?: boolean };
      }
  > {
    if (selection.filters.length === 0) return { kind: "selection", selection };

    const filters = [];
    for (const filter of selection.filters) {
      const dimension = domain.dimensions.find((candidate) => candidate.id === filter.dimensionId);
      if (!dimension) {
        filters.push(filter);
        continue;
      }

      const values = await this.dimensionValues.values(domain.goldObject, dimension.column);
      if (values.length === 0 || values.length > maxValues) {
        filters.push(filter);
        continue;
      }

      const normalized = normalizeFilterValue(filter.value, values);
      if (!normalized.ok) {
        return {
          kind: "clarify",
          clarify: {
            prompt: `I could not match "${normalized.value}" to a valid ${dimension.label} value. Choose one of the valid options.`,
            options: values,
            resumesQuestion: true,
          },
        };
      }
      filters.push({ ...filter, value: normalized.value });
    }

    return { kind: "selection", selection: { ...selection, filters } };
  }
}

function cloneSelection(selection: Selection): Selection {
  return {
    ...selection,
    measureIds: [...selection.measureIds],
    dimensionIds: [...selection.dimensionIds],
    filters: selection.filters.map((filter) => ({ ...filter })),
    ...(selection.timeWindow ? { timeWindow: { ...selection.timeWindow } } : {}),
  };
}

function domainScopedToReport(domain: DomainSpec, selection: Selection): DomainSpec {
  const reportMeasureIds = new Set(selection.measureIds);
  const reportDimensionIds = new Set(selection.dimensionIds);
  return {
    ...domain,
    measures: domain.measures.filter((measure) => reportMeasureIds.has(measure.id)),
    dimensions: domain.dimensions.filter((dimension) => reportDimensionIds.has(dimension.id)),
  };
}

function applyReportGroundingToSelection(selection: Selection, reportSelection: Selection): Selection | undefined {
  if (selection.domain !== reportSelection.domain) return undefined;

  const reportMeasureIds = new Set(reportSelection.measureIds);
  const reportDimensionIds = new Set(reportSelection.dimensionIds);
  if (selection.measureIds.length === 0) return undefined;
  if (!selection.measureIds.every((id) => reportMeasureIds.has(id))) return undefined;
  if (!selection.dimensionIds.every((id) => reportDimensionIds.has(id))) return undefined;
  if (!selection.filters.every((filter) => reportDimensionIds.has(filter.dimensionId))) return undefined;

  const selectedFilters = selection.filters.filter(
    (filter) => !reportSelection.filters.some((reportFilter) => sameFilter(reportFilter, filter)),
  );

  return {
    domain: selection.domain,
    measureIds: [...selection.measureIds],
    dimensionIds: [...selection.dimensionIds],
    filters: [...reportSelection.filters.map((filter) => ({ ...filter })), ...selectedFilters],
    ...(reportSelection.timeWindow ? { timeWindow: { ...reportSelection.timeWindow } } : {}),
    limit: reportSelection.limit,
  };
}

function sameFilter(left: Selection["filters"][number], right: Selection["filters"][number]): boolean {
  return (
    left.dimensionId === right.dimensionId &&
    left.op === right.op &&
    JSON.stringify(left.value) === JSON.stringify(right.value)
  );
}

function isBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("unknown measure") ||
    message.includes("cross-object composition") ||
    message.includes("missing required row scope") ||
    message.includes("invalid time window column")
  );
}

function normalizeFilterValue(
  value: string | string[],
  allowedValues: string[],
): { ok: true; value: string | string[] } | { ok: false; value: string } {
  if (Array.isArray(value)) {
    const normalized = [];
    for (const item of value) {
      const match = matchCaseInsensitive(item, allowedValues);
      if (!match) return { ok: false, value: item };
      normalized.push(match);
    }
    return { ok: true, value: normalized };
  }

  const match = matchCaseInsensitive(value, allowedValues);
  return match ? { ok: true, value: match } : { ok: false, value };
}

function matchCaseInsensitive(value: string, allowedValues: string[]): string | undefined {
  const lower = value.toLocaleLowerCase();
  return allowedValues.find((candidate) => candidate.toLocaleLowerCase() === lower);
}

export function isTimeDimension(domain: DomainSpec, dimId: string, measureIds?: string[]): boolean {
  const dimension = domain.dimensions.find((dim) => dim.id === dimId);
  if (!dimension) return false;

  const allowedMeasureIds = new Set(measureIds ?? domain.measures.map((measure) => measure.id));
  const timeColumns = domain.measures
    .filter((measure) => allowedMeasureIds.has(measure.id))
    .map((measure) => measure.timeColumn)
    .filter((column): column is string => Boolean(column));

  return timeColumns.includes(dimension.column) || dimension.id === "date" || dimension.column === "dt_created_date";
}

export interface AvailableFields {
  dimensions: { id: string; label: string; values?: string[] }[];
  measures: { id: string; label: string }[];
}

export function availableFieldsForDomain(domain: DomainSpec, permissions: Permissions): AvailableFields {
  const blockedColumns = new Set(domain.blockedColumns ?? []);

  return {
    dimensions: domain.dimensions
      .filter((dimension) => permissions.dimensionIds.includes(dimension.id))
      .filter((dimension) => !blockedColumns.has(dimension.column))
      .map((dimension) => ({ id: dimension.id, label: dimension.label })),
    measures: domain.measures
      .filter((measure) => permissions.measureIds.includes(measure.id))
      .filter((measure) => !blockedColumns.has(measure.id.split(".").pop()!))
      .map((measure) => ({ id: measure.id, label: measure.label })),
  };
}

export function trimPriorTurnsToTokenBudget(
  turns: LlmPriorTurn[],
  charBudget = LLM_CONTEXT_CHAR_BUDGET,
): LlmPriorTurn[] {
  const retained = [...turns];
  while (retained.length > 0 && JSON.stringify(retained).length > charBudget) {
    retained.shift();
  }
  return retained;
}

export function isVerifiedSelection(
  selection: Selection,
  resolveMeasure: (domain: string, measureId: string) => MeasureSpec | undefined,
): boolean {
  return selection.measureIds.every((id) => resolveMeasure(selection.domain, id) != null);
}

function buildViewInReport(
  domain: DomainSpec,
  statementScope: MasterResolvedSelection | undefined,
  activeBatchIds: NonNullable<Provenance["activeBatchIds"]>,
): NonNullable<AskResponse["viewInReport"]> {
  if (domain.name !== "mis-statement") {
    return { available: false, reason: "This answer was not executed against the MIS statement." };
  }
  if (!statementScope) {
    return { available: false, reason: "The answer does not resolve to one statement selector set." };
  }
  return {
    available: true,
    department: statementScope.department,
    function: statementScope.function,
    plant: statementScope.plant,
    period: statementScope.period.value,
    activeBatchIds,
  };
}

type StatementRequestResult =
  | { kind: "scope"; attribute: "department" | "function" | "plant" }
  | { kind: "no-mapping" }
  | { kind: "no-periods" }
  | { kind: "period"; options: AskPeriodOption[] }
  | { kind: "resolved"; resolution: MasterResolvedSelection; options: AskPeriodOption[] };

async function statementRequest(
  user: AuthUser,
  window: AppliedTimeWindow | undefined,
  timeColumn: string,
  resolver: SelectionResolverService,
): Promise<StatementRequestResult> {
  const value = (attribute: "department" | "function" | "plant") => {
    const values = [
      ...new Set(user.scope.filter((scope) => scope.attribute === attribute).map((scope) => scope.value)),
    ];
    return values.length === 1 ? values[0] : undefined;
  };
  const attributes = ["department", "function", "plant"] as const;
  const scope = Object.fromEntries(attributes.map((attribute) => [attribute, value(attribute)])) as Record<
    (typeof attributes)[number],
    string | undefined
  >;
  const offender = attributes.find((attribute) => !scope[attribute]);
  if (offender) return { kind: "scope", attribute: offender };

  const mapping = { department: scope.department!, function: scope.function!, plant: scope.plant! };
  if (!resolver.hasMapping(mapping)) return { kind: "no-mapping" };

  const periods = (await resolver.options()).periods;
  if (periods.length === 0) return { kind: "no-periods" };
  const options = askPeriodOptions(statementPeriodOptions(periods), timeColumn);
  const period = window && options.find((option) => windowMatchesPeriod(window, option));
  if (!period) return { kind: "period", options };

  try {
    // `periods` is already loaded above; hand it back so resolve() does not repeat that query.
    const resolution = await resolver.resolve({ ...mapping, period: period.value }, periods);
    return resolution.outcome === "resolved" ? { kind: "resolved", resolution, options } : { kind: "no-mapping" };
  } catch (error) {
    if (error instanceof SelectionPeriodUnavailableError) return { kind: "period", options };
    throw error;
  }
}

function askPeriodOptions(
  periods: Array<{ value: string; label: string; from: string; to: string }>,
  column: string,
): AskPeriodOption[] {
  return periods.map(({ value, label, from, to }) => ({
    value,
    label,
    timeWindow: { grain: "month", column, from, to: monthEnd(to) },
  }));
}

function monthEnd(first: string): string {
  const date = new Date(`${first}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/**
 * Deliberately compares DATES and the time column, never a grain. AppliedTimeWindow carries no
 * grain, and forcing one in would break the case this exists for: a clicked single-day period and
 * a natural-language whole month are the SAME period and must both match the same entry, which is
 * why `to` is allowed to equal either end of the option. The column check is belt-and-braces -
 * options are built with the answer own time column today - so a future caller cannot match a
 * window against a period measured on a different column.
 */
function windowMatchesPeriod(window: AppliedTimeWindow, option: AskPeriodOption): boolean {
  return (
    window.column === option.timeWindow.column &&
    window.from === option.timeWindow.from &&
    (window.to === option.timeWindow.from || window.to === option.timeWindow.to)
  );
}

function withoutTimeWindow(selection: Selection): Selection {
  const { timeWindow: _timeWindow, ...base } = selection;
  return base;
}

function buildPeriodControl(
  selection: Selection,
  window: AppliedTimeWindow | undefined,
  options: AskPeriodOption[],
): AskPeriodControl {
  if (!window)
    return {
      current: null,
      options,
      coverage: "All loaded data within your access scope and any filters applied by this question.",
    };

  const current = options.find((option) => windowMatchesPeriod(window, option));
  if (current) return { current: current.value, options };

  const value = window.from === window.to ? window.from : `${window.from}:${window.to}`;
  return {
    current: value,
    options: [
      {
        value,
        label: window.from === window.to ? window.from : `${window.from} – ${window.to}`,
        timeWindow: {
          grain: selection.timeWindow?.grain ?? "day",
          column: window.column,
          from: window.from,
          to: window.to,
        },
      },
      ...options,
    ],
  };
}

export function buildReadback(
  domain: DomainSpec,
  selection: Selection,
  measures: MeasureSpec[],
  appliedTimeWindow: AppliedTimeWindow | undefined,
  scope: string,
): string {
  const countedClause = [`Counted ${joinLabels(measures.map((measure) => measure.label)) || "selected measure"}`];

  const dimensionLabels = selection.dimensionIds
    .map((id) => domain.dimensions.find((dimension) => dimension.id === id)?.label ?? id)
    .filter(Boolean);
  if (dimensionLabels.length > 0) countedClause.push(`by ${joinLabels(dimensionLabels)}`);

  const clauses = [countedClause.join(" ")];

  if (appliedTimeWindow) {
    clauses.push(
      `from ${appliedTimeWindow.from} to ${appliedTimeWindow.to} (by ${timeColumnLabel(domain, appliedTimeWindow.column)})`,
    );
  }

  const impliedFilters = measures.flatMap((measure) => measure.impliedFilters);
  if (impliedFilters.length > 0) clauses.push(`${filterClausePrefix(impliedFilters)} ${impliedFilters.join("; ")}`);

  clauses.push(`scoped to ${scope || "all permitted"}`);
  return `${clauses.join(", ")}.`;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function timeColumnLabel(domain: DomainSpec, column: string): string {
  const label = domain.dimensions.find((dimension) => dimension.column === column)?.label ?? column;
  return label.toLocaleLowerCase();
}

function filterClausePrefix(filters: string[]): "excluding" | "where" {
  return filters.some((filter) => /<>|!=|\bnot\b/i.test(filter)) ? "excluding" : "where";
}
