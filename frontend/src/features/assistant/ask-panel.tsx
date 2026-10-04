"use client";

import {
  type AskRequest,
  type AskResponse,
  type AskRowLabel,
  type ChartType,
  type FixedScaleMoney,
  type MeasureFormat,
  type ProvenanceBatch,
  type ResultTable,
  type Selection,
  type AskStatementGrounding,
  type MisStatementMeasureBlock,
  type MisStatementResolvedResponse,
} from "@3f/contract";
import { ExternalLink, MessageSquareText, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "@/src/lib/api";
import { formatMoney, formatPercentage } from "../mis/statement-view";
import { DrillPanel, type AskDrillPanelSelection } from "../mis/drill-panel";
import { measureFilterLabel } from "../exploration/selection-label";
import { useAsk, type AskTurn } from "./use-ask";
import { StatementExplanation } from "./statement-explanation";

const SEED_QUESTIONS = [
  // These name only things the selector can actually resolve. The plant is NOT a dimension -
  // it comes from the signed-in user's scope - so naming one in the question left the model
  // with unmappable text and it either invented a filter or marked the ask unsupported.
  // The period is named explicitly because "this month" resolves to a month with no actuals.
  "Show Actual and Budget by GL code for July 2026",
  "Show percentage of budget by GL code for July 2026",
  "Show the MIS statement Actual by statement leaf for July 2026",
];
const CHART_COLORS = ["#1c6b49", "#0c3529", "#7aa889", "#c8922f"];
const PHASE_LABELS = {
  routing: "Routing question",
  selecting: "Selecting governed measures",
  querying: "Querying governed data",
  summarizing: "Summarizing answer",
} as const;

export function AskPanel({
  surface,
  onCollapse,
  grounding,
  statement,
  groundingUnavailable,
  onOpenDrill,
  storedAnswer = false,
}: Readonly<{
  surface: "docked" | "page";
  onCollapse?: () => void;
  grounding?: AskStatementGrounding;
  statement?: MisStatementResolvedResponse;
  groundingUnavailable?: string;
  onOpenDrill?: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
  storedAnswer?: boolean;
}>) {
  const { turns, phases, isPending, error, scrollTargetId, clearScrollTarget, ask, askGrounded, continueTurn } =
    useAsk();
  const [draft, setDraft] = useState("");
  const [askDrill, setAskDrill] = useState<AskDrillPanelSelection | null>(null);
  const [continuationFocusTurnId, setContinuationFocusTurnId] = useState<string>();
  const threadRef = useRef<HTMLDivElement>(null);
  const visibleTurns = surface === "page" ? turns.filter((turn) => turn.origin === "ungrounded") : turns;
  const suggestions = latestSuggestions(visibleTurns) ?? SEED_QUESTIONS;

  useEffect(() => {
    if (surface !== "page" || !scrollTargetId) return;
    const target = threadRef.current?.querySelector<HTMLElement>(`#${CSS.escape(scrollTargetId)}`);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    clearScrollTarget();
  }, [clearScrollTarget, scrollTargetId, surface, turns]);

  useEffect(() => {
    if (!continuationFocusTurnId) return;
    const exchange = threadRef.current?.querySelector<HTMLElement>(`[data-ask-turn="${continuationFocusTurnId}"]`);
    const answer = exchange?.querySelector<HTMLElement>(".ask-answer");
    if (!answer || answer.getAttribute("aria-busy") === "true") return;
    const nextChoice = answer.querySelector<HTMLElement>("button:not(:disabled), select:not(:disabled)");
    if (nextChoice) nextChoice.focus();
    else {
      answer.tabIndex = -1;
      answer.focus();
    }
    setContinuationFocusTurnId(undefined);
  }, [continuationFocusTurnId, turns]);

  async function continueAndFocus(
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
    requestOrigin?: AskRequest["origin"],
  ) {
    const started = await continueTurn(turnId, question, selection, failurePolicy, requestOrigin);
    if (started && requestOrigin === "plant-choice") setContinuationFocusTurnId(turnId);
    return started;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft;
    setDraft("");
    if (surface === "docked" && grounding) void askGrounded(question, grounding);
    else if (!groundingUnavailable) void ask(question);
  }

  return (
    <>
      <section className="ask-panel" data-surface={surface} aria-label={surface === "docked" ? "Ask panel" : "Ask"}>
        <header className="ask-header">
          <div className="ask-heading">
            <MessageSquareText size={16} aria-hidden="true" />
            <h1>Ask</h1>
          </div>
          {surface === "docked" && (
            <div className="ask-header-actions">
              <Link className="ask-open-link" href="/ask" prefetch={false}>
                <ExternalLink size={13} aria-hidden="true" /> Open in Ask
              </Link>
              <button className="ask-collapse" type="button" aria-label="Collapse Ask" onClick={onCollapse}>
                <X size={14} />
              </button>
            </div>
          )}
        </header>

        <div className="ask-intro">
          <p>Ask about this report. Each answer shows its verification status.</p>
          {groundingUnavailable && (
            <p className="ask-grounding-unavailable" role="status">
              {groundingUnavailable}
            </p>
          )}
          <span className="ask-eyebrow">Suggested</span>
          <div className="ask-suggestions">
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={isPending || Boolean(groundingUnavailable)}
                onClick={() =>
                  void (surface === "docked" && grounding ? askGrounded(question, grounding) : ask(question))
                }
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <div className="ask-thread" aria-live="polite" ref={threadRef}>
          {visibleTurns.map((turn) => (
            <div
              className="ask-exchange"
              id={surface === "page" ? turn.id : undefined}
              data-ask-turn={turn.id}
              key={turn.id}
            >
              <p className="ask-question">{turn.question}</p>
              <Answer
                turn={turn}
                isPending={isPending}
                onAsk={ask}
                onContinue={continueAndFocus}
                statement={statement}
                onOpenDrill={onOpenDrill}
                storedAnswer={storedAnswer}
                onOpenAskDrill={setAskDrill}
              />
            </div>
          ))}
          {phases.length > 0 && (
            <ol className="ask-progress" aria-label="Answer progress">
              {phases.map((phase) => (
                <li key={phase}>{PHASE_LABELS[phase]}</li>
              ))}
            </ol>
          )}
          {error && (
            <p className="ask-failure" role="alert">
              {error}
            </p>
          )}
        </div>

        <form className="ask-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor={`ask-question-${surface}`}>
            Ask about your MIS data
          </label>
          <input
            id={`ask-question-${surface}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your MIS data…"
            disabled={Boolean(groundingUnavailable)}
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={isPending || !draft.trim() || Boolean(groundingUnavailable)}
          >
            <Send size={15} />
          </button>
        </form>
      </section>
      {askDrill && <DrillPanel selection={askDrill} onClose={() => setAskDrill(null)} />}
    </>
  );
}

function Answer({
  turn,
  isPending,
  onAsk,
  onContinue,
  statement,
  onOpenDrill,
  storedAnswer,
  onOpenAskDrill,
}: Readonly<{
  turn: AskTurn;
  isPending: boolean;
  onAsk: (question: string) => Promise<void>;
  onContinue: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
    requestOrigin?: AskRequest["origin"],
  ) => Promise<boolean>;
  statement?: MisStatementResolvedResponse;
  onOpenDrill?: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
  storedAnswer: boolean;
  onOpenAskDrill: (selection: AskDrillPanelSelection) => void;
}>) {
  const { response, question } = turn;
  if (!response) {
    if (turn.error)
      return (
        <p className="ask-answer ask-failure" role="alert">
          {turn.error}
        </p>
      );
    return turn.isPending ? (
      <p className="ask-answer ask-period-status" role="status">
        Opening this report…
      </p>
    ) : null;
  }
  if (response.statementGrounding && statement && onOpenDrill) {
    return (
      <StatementExplanation response={response.statementGrounding} statement={statement} onOpenDrill={onOpenDrill} />
    );
  }
  if (response.responseClass === "success") {
    return (
      <SuccessAnswer
        turn={turn}
        response={response}
        isPending={isPending}
        onContinue={onContinue}
        storedAnswer={storedAnswer}
        onOpenAskDrill={onOpenAskDrill}
      />
    );
  }
  if (response.responseClass === "informational") {
    return (
      <article className="ask-answer ask-information">
        {response.title && <h2>{response.title}</h2>}
        {response.definition && <p>{response.definition}</p>}
      </article>
    );
  }
  if (response.responseClass === "clarification_needed") {
    const plantChoice = response.plantChoice;
    if (plantChoice) {
      return <PlantChoiceAnswer turn={turn} choice={plantChoice} onContinue={onContinue} />;
    }
    const choice = response.periodChoice;
    if (choice) {
      return (
        <article className="ask-answer ask-clarification" aria-busy={turn.isPending || undefined}>
          <p>{choice.prompt}</p>
          <div className="ask-options">
            {choice.options.map((option) => (
              <button
                type="button"
                key={option.value}
                disabled={turn.isPending}
                onClick={() =>
                  void onContinue(
                    turn.id,
                    choice.question,
                    {
                      ...choice.selection,
                      timeWindow: option.timeWindow,
                    },
                    "retain",
                    "period-choice",
                  )
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {turn.isPending && (
            <p className="ask-period-status" role="status">
              Loading the selected period…
            </p>
          )}
          {turn.error && (
            <p className="ask-period-error" role="alert">
              {turn.error}
            </p>
          )}
        </article>
      );
    }
    return (
      <article className="ask-answer ask-clarification">
        <p>{response.clarify?.prompt}</p>
        <div className="ask-options">
          {response.clarify?.options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => void onAsk(response.clarify?.resumesQuestion ? `${question} (${option})` : option)}
            >
              {option}
            </button>
          ))}
        </div>
      </article>
    );
  }
  if (response.responseClass === "blocked_by_policy" && response.refusal) {
    return <p className="ask-answer ask-failure">{plantRefusalMessage(response.refusal)}</p>;
  }
  return <p className="ask-answer ask-failure">{response.message}</p>;
}

function PlantChoiceAnswer({
  turn,
  choice,
  onContinue,
}: Readonly<{
  turn: AskTurn;
  choice: NonNullable<AskResponse["plantChoice"]>;
  onContinue: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
    requestOrigin?: AskRequest["origin"],
  ) => Promise<boolean>;
}>) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [validationMessage, setValidationMessage] = useState<string>();
  const answerRef = useRef<HTMLElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const validationId = useId();
  const allSelected = choice.allPlants.value.length > 0 && choice.allPlants.value.every((plant) => selected.has(plant));

  function selectPlant(plant: string, checked: boolean) {
    setValidationMessage(undefined);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(plant);
      else next.delete(plant);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setValidationMessage(undefined);
    setSelected(checked ? new Set(choice.allPlants.value) : new Set());
  }

  function submitPlants(event: FormEvent) {
    event.preventDefault();
    if (selected.size === 0) {
      setValidationMessage("Choose at least one plant");
      firstOptionRef.current?.focus();
      return;
    }
    const plantCodes = [...selected].sort();
    setValidationMessage(undefined);
    answerRef.current?.focus();
    void onContinue(
      turn.id,
      choice.question,
      {
        ...choice.selection,
        filters: [...choice.selection.filters, { dimensionId: "plant", op: "in", value: plantCodes }],
      },
      "retain",
      "plant-choice",
    );
  }

  const optionClassName =
    "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-full border border-[var(--kl-line)] bg-[var(--kl-white)] px-3 py-2 text-left text-[11.5px] text-[var(--kl-emerald)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--kl-emerald)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55";

  return (
    <article
      ref={answerRef}
      className="ask-answer ask-clarification focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kl-emerald)]"
      aria-busy={turn.isPending || undefined}
      tabIndex={-1}
    >
      <form className="grid min-w-0 gap-3" onSubmit={submitPlants}>
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={validationMessage ? validationId : undefined}>
          <legend className="mb-3 p-0">{choice.prompt}</legend>
          <div className="ask-options max-h-64 overflow-y-auto overscroll-contain pr-1">
            <label className={optionClassName}>
              <input
                ref={firstOptionRef}
                className="h-4 w-4 shrink-0 accent-[var(--kl-emerald)]"
                type="checkbox"
                checked={allSelected}
                disabled={turn.isPending}
                onChange={(event) => selectAll(event.target.checked)}
              />
              <span>{choice.allPlants.label}</span>
            </label>
            {choice.options.map((option) => (
              <label className={optionClassName} key={option.value}>
                <input
                  className="h-4 w-4 shrink-0 accent-[var(--kl-emerald)]"
                  type="checkbox"
                  checked={selected.has(option.value)}
                  disabled={turn.isPending}
                  onChange={(event) => selectPlant(option.value, event.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {validationMessage && (
          <p className="ask-period-error" id={validationId} role="status">
            {validationMessage}
          </p>
        )}
        <div className="ask-options">
          <button className="min-h-11" type="submit" disabled={turn.isPending}>
            Show answer
          </button>
        </div>
      </form>
      {turn.isPending && (
        <p className="ask-period-status" role="status">
          Loading the selected plants…
        </p>
      )}
      {turn.error && (
        <p className="ask-period-error" role="alert">
          {turn.error}
        </p>
      )}
    </article>
  );
}

function plantRefusalMessage(refusal: NonNullable<AskResponse["refusal"]>): string {
  const plants = refusal.plants.join(", ");
  switch (refusal.reason) {
    case "plant-not-granted":
      return `You do not have access to ${plants}.`;
    case "plants-revoked":
      return `This view includes plants you no longer have access to: ${plants}. Edit its plants to run it.`;
    case "choice-plants-revoked":
      return `You no longer have access to ${plants}. Ask again.`;
    case "plant-filter-invalid":
      return "This question's plant choice is not valid. Choose the plants again.";
    case "no-plants-granted":
      return "You do not have access to any plant.";
  }
}

function SuccessAnswer({
  turn,
  response,
  isPending,
  onContinue,
  storedAnswer,
  onOpenAskDrill,
}: Readonly<{
  turn: AskTurn;
  response: AskResponse;
  isPending: boolean;
  onContinue: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
    requestOrigin?: AskRequest["origin"],
  ) => Promise<boolean>;
  storedAnswer: boolean;
  onOpenAskDrill: (selection: AskDrillPanelSelection) => void;
}>) {
  const storedResponse = useRef(storedAnswer ? response : null);
  const isStoredTurn = storedAnswer && storedResponse.current === response;
  const [saving, setSaving] = useState<"save" | "pin">();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string }>();
  const comparisonReadout = appliedComparisonReadout(response);
  const emptyComparisonMessage = appliedComparisonEmptyMessage(response);

  async function preserve(kind: "save" | "pin") {
    if (!response.selection) return;
    setSaving(kind);
    setNotice(undefined);
    try {
      if (kind === "save") {
        await api.saveQuery({
          selection: response.selection,
          ...(response.chartType ? { chartType: response.chartType } : {}),
        });
        setNotice({ kind: "success", message: "Saved view" });
      } else {
        await api.createPin({
          selection: response.selection,
          ...(response.title ? { title: response.title } : {}),
          ...(response.chartType ? { chartType: response.chartType } : {}),
        });
        setNotice({ kind: "success", message: "Pinned report" });
      }
    } catch (caught) {
      setNotice({
        kind: "error",
        message:
          apiUserMessage(caught) ??
          (kind === "save" ? "The view could not be saved. Try again." : "The report could not be pinned. Try again."),
      });
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <article className="ask-answer ask-success" aria-busy={turn.isPending || undefined}>
      {response.provenance?.verified && <span className="ask-verified">✓ Verified</span>}
      {response.title && <h2>{response.title}</h2>}
      {comparisonReadout && <p className="ask-report-reason">{comparisonReadout}</p>}
      {response.totals && (
        <dl className="ask-totals">
          {Object.entries(response.totals).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{cell(value, formatForKey(response.result, label))}</dd>
            </div>
          ))}
        </dl>
      )}
      {response.result &&
        (emptyComparisonMessage ? (
          <p className="ask-report-reason">{emptyComparisonMessage}</p>
        ) : (
          <ResultVisual
            result={response.result}
            chartType={response.chartType}
            rowLabels={response.rowLabels}
            labelMode={response.selection?.domain === "mis-statement" ? "statement" : "gl-code"}
            selection={response.selection}
            drill={response.drill}
            storedAnswer={isStoredTurn}
            onOpenDrill={onOpenAskDrill}
            onAskAgain={() =>
              response.selection ? void onContinue(turn.id, turn.question, response.selection, "retain") : undefined
            }
          />
        ))}
      {response.provenance && <ProvenanceDisclosure provenance={response.provenance} />}
      <ViewInReport response={response} />
      {response.periodControl &&
        (response.periodControl.current === null ? (
          <p className="ask-period-coverage">{response.periodControl.coverage}</p>
        ) : (
          <label className="ask-period-control">
            <span>Period</span>
            <select
              value={response.periodControl.current}
              disabled={isPending}
              onChange={(event) => {
                const option = response.periodControl?.options.find(({ value }) => value === event.target.value);
                if (option && response.selection) {
                  void onContinue(
                    turn.id,
                    turn.question,
                    {
                      ...response.selection,
                      timeWindow: option.timeWindow,
                    },
                    "retain",
                    "period-choice",
                  );
                }
              }}
            >
              {response.periodControl.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      {turn.isPending && (
        <p className="ask-period-status" role="status">
          Loading the selected period…
        </p>
      )}
      {turn.error && (
        <p className="ask-period-error" role="alert">
          {turn.error}
        </p>
      )}
      {response.selection && (
        <div className="ask-preserve-actions">
          <button
            className="ask-save-view"
            type="button"
            aria-busy={saving === "save"}
            disabled={Boolean(saving)}
            onClick={() => void preserve("save")}
          >
            {saving === "save" ? "Saving…" : "Save view"}
          </button>
          <button
            className="ask-pin-report"
            type="button"
            aria-busy={saving === "pin"}
            disabled={Boolean(saving)}
            onClick={() => void preserve("pin")}
          >
            {saving === "pin" ? "Pinning…" : "Pin report"}
          </button>
          {notice && (
            <span
              className="ask-preserve-notice"
              data-error={notice.kind === "error" || undefined}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.message}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function apiUserMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("userMessage" in error)) return undefined;
  return typeof error.userMessage === "string" ? error.userMessage : undefined;
}

function ResultVisual({
  result,
  chartType = "table",
  rowLabels,
  labelMode,
  selection,
  drill,
  storedAnswer,
  onOpenDrill,
  onAskAgain,
}: Readonly<{
  result: ResultTable;
  chartType?: ChartType;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
  selection?: Selection;
  drill?: AskResponse["drill"];
  storedAnswer: boolean;
  onOpenDrill: (selection: AskDrillPanelSelection) => void;
  onAskAgain: () => void;
}>) {
  if (chartType === "table" || !canDraw(result, chartType)) {
    return (
      <ResultTableView
        result={result}
        rowLabels={rowLabels}
        labelMode={labelMode}
        selection={selection}
        drill={drill}
        storedAnswer={storedAnswer}
        onOpenDrill={onOpenDrill}
        onAskAgain={onAskAgain}
      />
    );
  }
  if (chartType === "kpi") {
    return (
      <dl className="ask-kpis" aria-label="Key results">
        {result.columns.map((measure) => (
          <div key={measure.key}>
            <dt>{measure.label}</dt>
            <dd>{cell(result.rows[0]?.[measure.key])}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <ResultChart
      result={result}
      chartType={chartType}
      rowLabels={rowLabels}
      labelMode={labelMode}
      selection={selection}
      drill={drill}
      storedAnswer={storedAnswer}
      onOpenDrill={onOpenDrill}
      onAskAgain={onAskAgain}
    />
  );
}

function ResultChart({
  result,
  chartType,
  rowLabels,
  labelMode,
  selection,
  drill,
  storedAnswer,
  onOpenDrill,
  onAskAgain,
}: Readonly<{
  result: ResultTable;
  chartType: Exclude<ChartType, "kpi" | "table">;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
  selection?: Selection;
  drill?: AskResponse["drill"];
  storedAnswer: boolean;
  onOpenDrill: (selection: AskDrillPanelSelection) => void;
  onAskAgain: () => void;
}>) {
  const [recharts, setRecharts] = useState<typeof import("recharts")>();
  useEffect(() => {
    let mounted = true;
    void import("recharts").then(
      (module) => {
        if (mounted) setRecharts(module);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, []);

  if (!recharts)
    return (
      <ResultTableView
        result={result}
        rowLabels={rowLabels}
        labelMode={labelMode}
        selection={selection}
        drill={drill}
        storedAnswer={storedAnswer}
        onOpenDrill={onOpenDrill}
        onAskAgain={onAskAgain}
      />
    );
  const { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis } = recharts;
  const dimensions = result.columns.filter((column) => !column.numeric);
  const measures = result.columns.filter((column) => column.numeric);
  const dimension = dimensions[0]!;
  return (
    <div className="ask-chart">
      <div className="ask-chart-canvas" role="img" aria-label={`${chartType} chart`}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "pie" ? (
            <PieChart>
              <Pie data={result.rows} dataKey={measures[0]!.key} nameKey={dimension.key} outerRadius="78%">
                {result.rows.map((row, index) => (
                  <Cell key={String(row[dimension.key])} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : chartType === "line" ? (
            <LineChart data={result.rows}>
              <CartesianGrid stroke="#e3e9e5" vertical={false} />
              <XAxis dataKey={dimension.key} tickLine={false} axisLine={false} />
              {measures.map((measure, index) => (
                <Line
                  key={measure.key}
                  dataKey={measure.key}
                  name={measure.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={result.rows}>
              <CartesianGrid stroke="#e3e9e5" vertical={false} />
              <XAxis dataKey={dimension.key} tickLine={false} axisLine={false} />
              {measures.map((measure, index) => (
                <Bar
                  key={measure.key}
                  dataKey={measure.key}
                  name={measure.label}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <ResultTableView
        result={result}
        rowLabels={rowLabels}
        labelMode={labelMode}
        selection={selection}
        drill={drill}
        storedAnswer={storedAnswer}
        onOpenDrill={onOpenDrill}
        onAskAgain={onAskAgain}
      />
    </div>
  );
}

function ResultTableView({
  result,
  rowLabels,
  labelMode,
  selection,
  drill,
  storedAnswer,
  onOpenDrill,
  onAskAgain,
}: Readonly<{
  result: ResultTable;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
  selection?: Selection;
  drill?: AskResponse["drill"];
  storedAnswer: boolean;
  onOpenDrill: (selection: AskDrillPanelSelection) => void;
  onAskAgain: () => void;
}>) {
  const suppressed = new Set(result.suppressedCells?.map(({ row, key }) => `${row}:${key}`));
  const labels = new Map(rowLabels?.map((label) => [label.key, label]));
  const rowKeyColumn = selection?.dimensionIds.length === 1 ? selection.dimensionIds[0] : undefined;
  const actualMeasureId =
    selection?.domain === "governed-financial" ? "governed-financial.actual" : "mis-statement.actual_net";
  const actualColumn = selection?.measureIds.includes(actualMeasureId) ? actualMeasureId.split(".").at(-1) : undefined;
  const drillRows = new Map(drill?.rows.map((row) => [row.key, row.drillable]));
  return (
    <div className="ask-table-wrap">
      <table className="ask-table">
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={result.columns.map((column) => String(row[column.key])).join("|")}>
              {result.columns.map((column) => {
                const value = row[column.key];
                const label = !column.numeric && typeof value === "string" ? labels.get(value) : undefined;
                const rawRowKey = rowKeyColumn ? row[rowKeyColumn] : undefined;
                const rowKey = typeof rawRowKey === "string" ? rawRowKey : undefined;
                const rowLabel = rowKey ? labels.get(rowKey) : undefined;
                const displayLabel = rowKey ? visibleRowLabel(rowKey, rowLabel, labelMode) : undefined;
                const actual = column.key === actualColumn ? asFixedScaleMoney(value) : undefined;
                const opensTransactions = Boolean(
                  !storedAnswer && drill && rowKey && actual && drillRows.get(rowKey) === true,
                );
                const offersAskAgain = Boolean(storedAnswer && rowKey && actual);
                return (
                  <td key={column.key} data-numeric={column.numeric || undefined}>
                    {suppressed.has(`${rowIndex}:${column.key}`) ? (
                      "—"
                    ) : label ? (
                      <ResultRowLabel rawKey={String(value)} label={label} mode={labelMode} />
                    ) : opensTransactions ? (
                      <button
                        className="mis-actual-action inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:active:!transform-none motion-reduce:transform-none"
                        type="button"
                        aria-label={`Open transactions for ${displayLabel}, Actual ${cell(value, column.format)}`}
                        onClick={(event) =>
                          onOpenDrill({
                            kind: "ask",
                            context: drill!.context,
                            rowKey: rowKey!,
                            label: displayLabel!,
                            actual: actual!,
                            opener: event.currentTarget,
                          })
                        }
                      >
                        {cell(value, column.format)}
                      </button>
                    ) : offersAskAgain ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{cell(value, column.format)}</span>
                        <button
                          className="mis-actual-action inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:active:!transform-none motion-reduce:transform-none"
                          type="button"
                          aria-label={`Ask again to open transactions for ${displayLabel}, Actual ${cell(value, column.format)}`}
                          onClick={onAskAgain}
                        >
                          Ask again
                        </button>
                      </span>
                    ) : (
                      cell(value, column.format)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function visibleRowLabel(rawKey: string, label: AskRowLabel | undefined, mode: "gl-code" | "statement"): string {
  if (!label) return rawKey;
  return mode === "gl-code" ? `${rawKey} · ${label.label}` : label.label;
}

function asFixedScaleMoney(value: string | number | null): FixedScaleMoney | undefined {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : value?.trim();
  const match = text?.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return undefined;
  return `${match[1]}.${`${match[2] ?? ""}00`.slice(0, 2)}` as FixedScaleMoney;
}

function ResultRowLabel({
  rawKey,
  label,
  mode,
}: Readonly<{ rawKey: string; label: AskRowLabel; mode: "gl-code" | "statement" }>) {
  const [expanded, setExpanded] = useState(false);
  const [pointerPressed, setPointerPressed] = useState(false);
  const otherNamesId = useId();
  const visibleLabel = mode === "gl-code" ? `${rawKey} · ${label.label}` : label.label;
  const otherNameCount = label.otherLabels.length;
  const accessibleNames = label.otherLabels.join(", ");

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setExpanded(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((current) => !current);
    }
  }

  return (
    <div>
      <span>{visibleLabel}</span>
      {otherNameCount > 0 && (
        <>
          {" "}
          <button
            className="relative inline-flex origin-center cursor-pointer items-center justify-center border-0 bg-transparent p-0 align-middle font-h2 text-emerald underline underline-offset-2 transition-transform after:absolute after:-inset-x-2 after:-inset-y-[7px] after:content-[''] data-[pointer-pressed=true]:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald motion-reduce:transform-none"
            type="button"
            style={{
              transitionDuration: "140ms",
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
            }}
            data-pointer-pressed={pointerPressed || undefined}
            aria-expanded={expanded}
            aria-controls={otherNamesId}
            onClick={() => setExpanded((current) => !current)}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => setPointerPressed(!event.currentTarget.matches(":focus-visible"))}
            onPointerUp={() => setPointerPressed(false)}
            onPointerCancel={() => setPointerPressed(false)}
            onPointerLeave={() => setPointerPressed(false)}
            onBlur={() => setPointerPressed(false)}
          >
            <span aria-hidden="true">+{otherNameCount} more</span>
            <span className="sr-only">
              {otherNameCount} more account names: {accessibleNames}
            </span>
          </button>
          {expanded && (
            <ul
              id={otherNamesId}
              aria-label="Other account names"
              className="m-0 list-none p-0 text-left text-secondary"
            >
              {label.otherLabels.map((otherLabel) => (
                <li key={otherLabel}>{otherLabel}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ProvenanceDisclosure({ provenance }: Readonly<{ provenance: NonNullable<AskResponse["provenance"]> }>) {
  return (
    <details className="ask-provenance">
      <summary>How this was calculated</summary>
      <dl>
        <div>
          <dt>Readback</dt>
          <dd>{provenance.readback}</dd>
        </div>
        <div>
          <dt>Measures</dt>
          <dd>{provenance.measures.map((measure) => measure.label).join(" · ")}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{provenance.scope}</dd>
        </div>
        <div>
          <dt>Data as of</dt>
          <dd>{provenance.dataAsOf ?? "Unavailable"}</dd>
        </div>
      </dl>
    </details>
  );
}

function ViewInReport({ response }: Readonly<{ response: AskResponse }>) {
  // Label the reason. Unlabelled, a sentence explaining why ONE LINK is unavailable sits
  // directly under the result and reads as a caveat about whether the answer is trustworthy.
  if (!response.viewInReport.available)
    return (
      <p className="ask-report-reason">
        <span className="ask-report-reason-label">View in report unavailable</span>
        {response.viewInReport.reason}
      </p>
    );
  return (
    <Link className="ask-report-link" href={reportHref(response.viewInReport)} prefetch={false}>
      View in report
    </Link>
  );
}

function reportHref(view: Extract<AskResponse["viewInReport"], { available: true }>): string {
  const params = new URLSearchParams({
    department: view.department,
    function: view.function,
    plant: view.plant,
    period: view.period,
    activeBatchIds: JSON.stringify(view.activeBatchIds),
  });
  return `/mis-reports?${params.toString()}`;
}

function canDraw(result: ResultTable, chartType: ChartType): boolean {
  if (chartType === "table") return false;
  if (result.suppressedCells?.length) return false;
  const dimensions = result.columns.filter((column) => !column.numeric);
  const measures = result.columns.filter((column) => column.numeric);
  if (!result.rows.length || !measures.length) return false;
  if (result.rows.some((row) => measures.some((measure) => !isNumeric(row[measure.key])))) return false;
  if (chartType === "kpi") return dimensions.length === 0 && result.rows.length === 1;
  if (dimensions.length !== 1) return false;
  if (chartType === "pie") {
    const values = result.rows.map((row) => Number(row[measures[0]!.key]));
    return measures.length === 1 && values.every((value) => value >= 0) && values.some((value) => value > 0);
  }
  return result.rows.length > 1;
}

function isNumeric(value: string | number | null): boolean {
  return (
    typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
  );
}

function cell(value: string | number | null | undefined, format?: MeasureFormat): string | number {
  if (value === null || value === undefined) return "—";
  // A percent measure is a RATIO in the payload, and it may also carry a sentinel string
  // ("over-budget", "credit / negative actual") that formatPercentage passes through intact.
  if (format === "percent") return formatPercentage(String(value));
  if (format === "money") return formatAskMoney(value);
  return value;
}

/**
 * Ask receives amounts in two shapes the MIS payload never produces: table cells arrive as
 * numeric(18,2) strings, totals as JS numbers. formatMoney needs a fixed-scale string and
 * throws on anything else, so normalise first and hand back anything that is not an amount
 * rather than risk a render crash on a value shape we did not anticipate.
 */
function formatAskMoney(value: string | number): string {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return String(value);
  const [whole, fraction = ""] = text.split(".");
  return formatMoney(`${whole}.${`${fraction}00`.slice(0, 2)}` as FixedScaleMoney);
}

/** A total is keyed by its measure key, so its format is the matching column's format. */
function formatForKey(result: ResultTable | undefined, key: string): MeasureFormat | undefined {
  return result?.columns.find((column) => column.key === key)?.format;
}

function appliedComparisonReadout(response: AskResponse): string | undefined {
  const comparisons = appliedComparisonLabels(response);
  if (!comparisons) return undefined;
  const period = appliedPeriodLabel(response);
  return period ? `${comparisons} · ${period}` : comparisons;
}

function appliedComparisonEmptyMessage(response: AskResponse): string | undefined {
  if (response.result?.rows.length !== 0) return undefined;
  const comparisons = appliedComparisonLabels(response);
  if (!comparisons) return undefined;
  const period = appliedPeriodLabel(response);
  return `No lines match ${comparisons}${period ? ` for ${period}` : ""}`;
}

function appliedComparisonLabels(response: AskResponse): string | undefined {
  return response.appliedMeasureFilters?.length
    ? response.appliedMeasureFilters.map(measureFilterLabel).join(" · ")
    : undefined;
}

function appliedPeriodLabel(response: AskResponse): string | undefined {
  const window = response.appliedTimeWindow;
  if (window?.column === "month" && window.from.slice(0, 7) === window.to.slice(0, 7)) {
    const month = formatMonthYear(window.from);
    if (month) return month;
  }
  const current = response.periodControl?.current;
  const controlled = current
    ? response.periodControl?.options.find((option) => option.value === current)?.label
    : undefined;
  if (controlled) return controlled;
  if (!window) return undefined;
  const wholeMonths = window.column === "month" && coversWholeCalendarMonths(window.from, window.to);
  const from = wholeMonths ? formatMonthYear(window.from) : formatExactDate(window.from);
  const to = wholeMonths ? formatMonthYear(window.to) : formatExactDate(window.to);
  if (!from || !to) return undefined;
  return from === to ? from : `${from}${wholeMonths ? "–" : " – "}${to}`;
}

function formatMonthYear(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatExactDate(value: string): string | undefined {
  const date = exactDate(value);
  if (!date) return undefined;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function coversWholeCalendarMonths(from: string, to: string): boolean {
  const start = exactDate(from);
  const end = exactDate(to);
  if (!start || !end || start.getUTCDate() !== 1) return false;
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  return end.getUTCDate() === lastDay;
}

function exactDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

function latestSuggestions(turns: AskTurn[]): string[] | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const suggestions = turns[index]?.response?.suggestedQuestions;
    if (suggestions?.length) return suggestions;
  }
}

export function parseActiveBatchIds(value: string | null): ProvenanceBatch[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (batch) =>
          typeof batch === "object" &&
          batch !== null &&
          (batch.source === "actuals" || batch.source === "budget") &&
          typeof batch.period === "string" &&
          typeof batch.batchId === "string",
      )
    ) {
      return parsed as ProvenanceBatch[];
    }
  } catch {
    return undefined;
  }
}
