import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  ResponseClass,
  type AskReportGrounding,
  type AskResponse,
  type AuthUser,
  type ChatStreamEvent,
  type Chip,
  type ConversationAnswerSnapshot,
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
import { ConversationsService } from "../conversations/conversations.service";
import { ReportsService } from "../reports/reports.service";
import { HelpService } from "../help/help.service";
import { classifyMeta, glossaryLookup, unsupportedFallbackMessage } from "../help/glossary";
import { CHAT_MESSAGES } from "./chat.constants";
import { domainRoutingAmbiguity, requiredTimeWindowClarify } from "./ambiguity";
import { chooseChart } from "./chartChooser";
import { classifyReconciliationQuestion } from "./reconciliation-guard";
import { classifySmalltalk } from "./smalltalk-guard";
import { parseTimeWindow } from "./timeWindowParse";
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
    private readonly conversations: ConversationsService,
    private readonly dimensionValues: DimensionValuesService,
    private readonly reports: ReportsService,
    private readonly help: HelpService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async ask(
    user: AuthUser,
    sessionId: string,
    question: string,
    editedSelection?: Selection,
    conversationId?: string,
    turnId?: string,
    reportGrounding?: AskReportGrounding,
    onEvent?: (event: ChatStreamEvent) => void,
  ): Promise<AskResponse> {
    const started = Date.now();
    const cfg = loadConfig();
    let usedPriorContext = false;
    let llmUsage: LlmUsage | undefined;
    const done = (r: Omit<AskResponse, "sessionId" | "latencyMs">): AskResponse => {
      const res: AskResponse = {
        ...r,
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

    let conversationOwned = false;
    let priorSelection: Selection | undefined;
    let priorTurns: LlmPriorTurn[] = [];
    if (!groundedReport && conversationId && isDurableConversationId(conversationId)) {
      try {
        const storedTurns = await this.conversations.getRecentTurns(user.id, conversationId, cfg.sessionTurnWindow);
        conversationOwned = true;
        priorSelection = storedTurns.at(-1)?.selection;
        priorTurns = trimPriorTurnsToTokenBudget(
          storedTurns.map(({ question: priorQuestion, selection }) => ({
            question: priorQuestion,
            selection,
          })),
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    } else if (groundingPriorTurn) {
      priorTurns = trimPriorTurnsToTokenBudget([groundingPriorTurn]);
    }

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
      const dimensionValues = await this.dimensionValuesForAllowedDomains(llmAllowedDomains, cfg.dimensionEnumMax);
      const sel = await this.llm.select({
        question,
        allowedDomains: llmAllowedDomains,
        ...(priorTurns.length > 0 ? { priorTurns } : {}),
        dimensionValues,
      });
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
    if (domain.scopeColumn) {
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
        beforeExecute: async (built) => {
          try {
            await this.audit.writeRequestEvent({
              userId: user.id,
              sessionId,
              ...(conversationOwned && conversationId ? { conversationId } : {}),
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
      // `numeric` means "value/measure column" for rendering (chart axis, headline,
      // alignment) — NOT the raw SQL type. An integer DIMENSION (e.g. activity_hour
      // 0-23) is categorical here, so classify columns by measure-role, not warehouse type.
    } catch (e) {
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
      ...answerMetadata,
    };

    if (conversationOwned && conversationId) {
      const answer: ConversationAnswerSnapshot = {
        title: successResponse.title,
        chips: successResponse.chips,
        result: successResponse.result,
        chartType: successResponse.chartType,
        ...(totals ? { totals } : {}),
        provenance: successResponse.provenance,
        usedPriorContext,
        availableFields: successResponse.availableFields,
        appliedFilters: successResponse.appliedFilters,
        appliedTimeWindow: successResponse.appliedTimeWindow,
      };
      try {
        const persistedTurn =
          usesEditedSelection && turnId && isDurableConversationId(turnId)
            ? await this.conversations.replaceTurn(user.id, conversationId, turnId, question, selection, answer)
            : !usesEditedSelection
              ? await this.conversations.appendTurn(user.id, conversationId, {
                  question,
                  selection,
                  answer,
                })
              : undefined;
        if (persistedTurn) successResponse.turnId = persistedTurn.id;
      } catch (error) {
        if (groundedReport) throw error;
        if (!(error instanceof NotFoundException)) throw error;
      }
    }

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

function isDurableConversationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isVerifiedSelection(
  selection: Selection,
  resolveMeasure: (domain: string, measureId: string) => MeasureSpec | undefined,
): boolean {
  return selection.measureIds.every((id) => resolveMeasure(selection.domain, id) != null);
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
