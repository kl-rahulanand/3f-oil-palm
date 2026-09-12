"use client";

import { type AskResponse, type ChartType, type ProvenanceBatch, type ResultTable } from "@3f/contract";
import { ExternalLink, MessageSquareText, Send, X } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
} from "recharts";
import { useAsk, type AskTurn } from "./use-ask";

const SEED_QUESTIONS = [
  "Show Actual and Budget for Agriculture Nursery DUB this month",
  "Show percentage for Agriculture Nursery DUB this month",
  "Show MIS statement Actual for Agriculture Nursery DUB this month",
];
const CHART_COLORS = ["#1c6b49", "#0c3529", "#7aa889", "#c8922f"];

export function AskPanel({ surface, onCollapse }: Readonly<{ surface: "docked" | "page"; onCollapse?: () => void }>) {
  const { turns, isPending, error, ask } = useAsk();
  const [draft, setDraft] = useState("");
  const suggestions = latestSuggestions(turns) ?? SEED_QUESTIONS;

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft;
    setDraft("");
    void ask(question);
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
        <p>Ask about this report. Answers are verified against the source.</p>
        <span className="ask-eyebrow">Suggested</span>
        <div className="ask-suggestions">
          {suggestions.map((question) => (
            <button key={question} type="button" disabled={isPending} onClick={() => void ask(question)}>
              {question}
            </button>
          ))}
        </div>
      </div>

      <div className="ask-thread" aria-live="polite">
        {turns.map((turn, index) => (
          <div className="ask-exchange" key={`${turn.question}-${index}`}>
            <p className="ask-question">{turn.question}</p>
            <Answer response={turn.response} question={turn.question} onAsk={ask} />
          </div>
        ))}
        {isPending && <p className="ask-pending">Checking the governed data…</p>}
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
        />
        <button type="submit" aria-label="Send question" disabled={isPending || !draft.trim()}>
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}

function Answer({
  response,
  question,
  onAsk,
}: Readonly<{ response: AskResponse; question: string; onAsk: (question: string) => Promise<void> }>) {
  if (response.responseClass === "success") return <SuccessAnswer response={response} />;
  if (response.responseClass === "informational") {
    return (
      <article className="ask-answer ask-information">
        {response.title && <h2>{response.title}</h2>}
        {response.definition && <p>{response.definition}</p>}
      </article>
    );
  }
  if (response.responseClass === "clarification_needed") {
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

function SuccessAnswer({ response }: Readonly<{ response: AskResponse }>) {
  return (
    <article className="ask-answer ask-success">
      {response.provenance?.verified && <span className="ask-verified">✓ Verified</span>}
      {response.title && <h2>{response.title}</h2>}
      {response.totals && (
        <dl className="ask-totals">
          {Object.entries(response.totals).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {response.result && <ResultVisual result={response.result} chartType={response.chartType} />}
      {response.provenance && <ProvenanceDisclosure provenance={response.provenance} />}
      <ViewInReport response={response} />
    </article>
  );
}

function ResultVisual({ result, chartType = "table" }: Readonly<{ result: ResultTable; chartType?: ChartType }>) {
  return canDraw(result, chartType) ? (
    <ResultChart result={result} chartType={chartType} />
  ) : (
    <ResultTableView result={result} />
  );
}

function ResultChart({ result, chartType }: Readonly<{ result: ResultTable; chartType: ChartType }>) {
  const dimensions = result.columns.filter((column) => !column.numeric);
  const measures = result.columns.filter((column) => column.numeric);
  if (chartType === "kpi") {
    return (
      <dl className="ask-kpis" aria-label="Key results">
        {measures.map((measure) => (
          <div key={measure.key}>
            <dt>{measure.label}</dt>
            <dd>{cell(result.rows[0]?.[measure.key])}</dd>
          </div>
        ))}
      </dl>
    );
  }

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
      <ResultTableView result={result} />
    </div>
  );
}

function ResultTableView({ result }: Readonly<{ result: ResultTable }>) {
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
              {result.columns.map((column) => (
                <td key={column.key} data-numeric={column.numeric || undefined}>
                  {isSuppressed(result, rowIndex, column.key) ? "—" : cell(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  if (!response.viewInReport.available) return <p className="ask-report-reason">{response.viewInReport.reason}</p>;
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
  const dimensions = result.columns.filter((column) => !column.numeric);
  const measures = result.columns.filter((column) => column.numeric);
  if (!result.rows.length || !measures.length) return false;
  if (result.rows.some((row) => measures.some((measure) => !isNumeric(row[measure.key])))) return false;
  if (chartType === "kpi") return dimensions.length === 0 && result.rows.length === 1;
  if (dimensions.length !== 1) return false;
  if (chartType === "pie") return measures.length === 1;
  return result.rows.length > 1;
}

function isNumeric(value: string | number | null): boolean {
  return (
    typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
  );
}

function cell(value: string | number | null | undefined): string | number {
  return value ?? "—";
}

function isSuppressed(result: ResultTable, row: number, key: string): boolean {
  return result.suppressedCells?.some((cell) => cell.row === row && cell.key === key) ?? false;
}

function latestSuggestions(turns: AskTurn[]): string[] | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const suggestions = turns[index]?.response.suggestedQuestions;
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
