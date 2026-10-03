"use client";

import {
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
}: Readonly<{
  surface: "docked" | "page";
  onCollapse?: () => void;
  grounding?: AskStatementGrounding;
  statement?: MisStatementResolvedResponse;
  groundingUnavailable?: string;
  onOpenDrill?: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
}>) {
  const { turns, phases, isPending, error, scrollTargetId, clearScrollTarget, ask, askGrounded, continueTurn } =
    useAsk();
  const [draft, setDraft] = useState("");
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

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft;
    setDraft("");
    if (surface === "docked" && grounding) void askGrounded(question, grounding);
    else if (!groundingUnavailable) void ask(question);
  }

  return (
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
          <div className="ask-exchange" id={surface === "page" ? turn.id : undefined} key={turn.id}>
            <p className="ask-question">{turn.question}</p>
            <Answer
              turn={turn}
              isPending={isPending}
              onAsk={ask}
              onContinue={continueTurn}
              statement={statement}
              onOpenDrill={onOpenDrill}
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
  );
}

function Answer({
  turn,
  isPending,
  onAsk,
  onContinue,
  statement,
  onOpenDrill,
}: Readonly<{
  turn: AskTurn;
  isPending: boolean;
  onAsk: (question: string) => Promise<void>;
  onContinue: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
  ) => Promise<boolean>;
  statement?: MisStatementResolvedResponse;
  onOpenDrill?: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
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
    return <SuccessAnswer turn={turn} response={response} isPending={isPending} onContinue={onContinue} />;
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
  return <p className="ask-answer ask-failure">{response.message}</p>;
}

function SuccessAnswer({
  turn,
  response,
  isPending,
  onContinue,
}: Readonly<{
  turn: AskTurn;
  response: AskResponse;
  isPending: boolean;
  onContinue: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: "retain" | "clear-on-refusal",
  ) => Promise<boolean>;
}>) {
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
    } catch {
      setNotice({
        kind: "error",
        message:
          kind === "save" ? "The view could not be saved. Try again." : "The report could not be pinned. Try again.",
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

function ResultVisual({
  result,
  chartType = "table",
  rowLabels,
  labelMode,
}: Readonly<{
  result: ResultTable;
  chartType?: ChartType;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
}>) {
  if (chartType === "table" || !canDraw(result, chartType)) {
    return <ResultTableView result={result} rowLabels={rowLabels} labelMode={labelMode} />;
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
  return <ResultChart result={result} chartType={chartType} rowLabels={rowLabels} labelMode={labelMode} />;
}

function ResultChart({
  result,
  chartType,
  rowLabels,
  labelMode,
}: Readonly<{
  result: ResultTable;
  chartType: Exclude<ChartType, "kpi" | "table">;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
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

  if (!recharts) return <ResultTableView result={result} rowLabels={rowLabels} labelMode={labelMode} />;
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
      <ResultTableView result={result} rowLabels={rowLabels} labelMode={labelMode} />
    </div>
  );
}

function ResultTableView({
  result,
  rowLabels,
  labelMode,
}: Readonly<{
  result: ResultTable;
  rowLabels?: AskRowLabel[];
  labelMode: "gl-code" | "statement";
}>) {
  const suppressed = new Set(result.suppressedCells?.map(({ row, key }) => `${row}:${key}`));
  const labels = new Map(rowLabels?.map((label) => [label.key, label]));
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
                return (
                  <td key={column.key} data-numeric={column.numeric || undefined}>
                    {suppressed.has(`${rowIndex}:${column.key}`) ? (
                      "—"
                    ) : label ? (
                      <ResultRowLabel rawKey={String(value)} label={label} mode={labelMode} />
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

function ResultRowLabel({
  rawKey,
  label,
  mode,
}: Readonly<{ rawKey: string; label: AskRowLabel; mode: "gl-code" | "statement" }>) {
  const [expanded, setExpanded] = useState(false);
  const otherNamesId = useId();
  const visibleLabel = mode === "gl-code" ? `${rawKey} · ${label.label}` : label.label;
  const hiddenCountMatch = label.otherLabels.at(-1)?.match(/^and ([1-9]\d*) more$/u);
  const hiddenCount = hiddenCountMatch ? Number(hiddenCountMatch[1]) : 0;
  const otherNameCount = label.otherLabels.length - (hiddenCount ? 1 : 0) + hiddenCount;

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
            className="inline-flex h-button min-w-11 origin-center cursor-pointer items-center justify-center border-0 bg-transparent p-0 align-middle font-h2 text-emerald underline underline-offset-2 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald motion-reduce:transform-none"
            type="button"
            aria-expanded={expanded}
            aria-controls={otherNamesId}
            onClick={() => setExpanded((current) => !current)}
            onKeyDown={handleKeyDown}
          >
            <span aria-hidden="true">+{otherNameCount} more</span>
            <span className="sr-only">
              {otherNameCount} more account names: {label.otherLabels.join(", ")}
            </span>
          </button>
          {expanded && (
            <ul id={otherNamesId} aria-label="Other account names" className="m-0 list-none p-0 text-left">
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
