"use client";

import type {
  AskDrillResponse,
  FixedScaleMoney,
  MisDrillResponse,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
} from "@3f/contract";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/src/lib/api";
import {
  BUDGET_NOT_LOADED_LABEL,
  formatBlockHeading,
  formatExactMoney,
  formatMoney,
  formatPercentage,
  isBudgetNotLoaded,
} from "./statement-view";
import { useMisDrill } from "./use-mis-statement";

export interface StatementDrillPanelSelection {
  node: MisStatementNode;
  roots: MisStatementNode[];
  blockKey: MisStatementMeasureBlock["key"];
  breadcrumb: string[];
  response: MisStatementResolvedResponse;
  opener: HTMLButtonElement;
}

export interface AskDrillPanelSelection {
  kind: "ask";
  context: string;
  rowKey: string;
  label: string;
  actual: FixedScaleMoney;
  opener: HTMLButtonElement;
}

export type DrillPanelSelection = StatementDrillPanelSelection;
type AnyDrillPanelSelection = DrillPanelSelection | AskDrillPanelSelection;

const ZERO = BigInt(0);
const TEN = BigInt(10);
const ONE_HUNDRED = BigInt(100);
const ONE_THOUSAND = BigInt(1000);
const ASK_RELOADED_NOTICE =
  "This answer was built on data that has since been reloaded; these are the lines it was built from.";
const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function DrillPanel({
  selection,
  onClose,
}: Readonly<{ selection: AnyDrillPanelSelection; onClose: () => void }>) {
  const askSelection = isAskSelection(selection) ? selection : null;
  const statementSelection = isAskSelection(selection) ? null : selection;
  const isAsk = askSelection !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const leafButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterBack = useRef<string | null>(null);
  const [transactionNode, setTransactionNode] = useState<MisStatementNode | null>(
    statementSelection?.roots.length === 0 ? statementSelection.node : null,
  );
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MisDrillResponse | AskDrillResponse | null>(null);
  const {
    mutate: runStatementDrill,
    reset: resetStatementDrill,
    isPending: isStatementPending,
    isError: isStatementError,
    error: statementError,
  } = useMisDrill();
  const {
    mutate: runAskDrill,
    isPending: isAskPending,
    isError: isAskError,
    error: askError,
  } = useMutation({ mutationFn: api.runAskDrill });
  const leaves = flattenLeaves(statementSelection?.roots ?? []);
  const activeNode = statementSelection ? (transactionNode ?? statementSelection.node) : null;
  const clickedMeasure = activeNode && statementSelection ? measureFor(activeNode, statementSelection.blockKey) : null;
  const clickedActual = askSelection ? askSelection.actual : clickedMeasure!.actual;
  const isPending = isAsk ? isAskPending : isStatementPending;
  const isError = isAsk ? isAskError : isStatementError;
  const error = isAsk ? askError : statementError;
  const isTransactionView = isAsk || transactionNode !== null;

  useEffect(() => {
    dialogRef.current?.focus();
    return () => selection.opener.focus();
  }, [selection.opener]);

  useEffect(() => {
    if (transactionNode) dialogRef.current?.focus();
  }, [transactionNode]);

  useEffect(() => {
    if (!isAsk && !transactionNode) {
      const nodeKey = focusAfterBack.current;
      if (nodeKey) leafButtons.current.get(nodeKey)?.focus();
      focusAfterBack.current = null;
      return;
    }
    if (isAsk) {
      runAskDrill(
        { context: askSelection.context, rowKey: askSelection.rowKey, page },
        { onSuccess: setResult, onError: () => setResult(null) },
      );
      return;
    }
    if (!statementSelection || !transactionNode) return;
    const { department, function: functionName, plant, period } = statementSelection.response.scope;
    runStatementDrill(
      {
        department,
        function: functionName,
        plant,
        period,
        nodeKey: transactionNode.nodeKey,
        block: statementSelection.blockKey,
        pinnedBatches: statementSelection.response.provenance.activeBatchIds,
        page,
      },
      { onSuccess: setResult, onError: () => setResult(null) },
    );
  }, [askSelection, isAsk, page, runAskDrill, runStatementDrill, statementSelection, transactionNode]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) event.preventDefault();
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openLeaf(node: MisStatementNode) {
    setResult(null);
    setPage(1);
    setTransactionNode(node);
  }

  function showAggregate() {
    focusAfterBack.current = transactionNode?.nodeKey ?? null;
    resetStatementDrill();
    setResult(null);
    setTransactionNode(null);
    setPage(1);
  }

  const aggregateTotals = statementSelection ? aggregateTotal(statementSelection, leaves) : null;
  const transactionFoots = result ? toPaise(result.footer.value) === toPaise(clickedActual) : true;
  const transactionReplaced = !isAsk && (result?.batchStatuses.some(({ status }) => status === "replaced") ?? false);
  const title = askSelection ? askSelection.label : activeNode!.budgetComponent;

  return (
    <div className="mis-drill-layer">
      <div className="mis-drill-scrim" aria-hidden="true" data-testid="drill-scrim" onClick={onClose} />
      <div
        ref={dialogRef}
        className="mis-drill-panel max-[560px]:!w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mis-drill-title"
        aria-busy={isPending}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="mis-drill-header">
          <div className="mis-drill-heading">
            <div className="mis-drill-breadcrumb">
              <span className="mis-eyebrow">Drill-down</span>
              <span className="mis-drill-divider" />
              {statementSelection && transactionNode && statementSelection.roots.length > 0 ? (
                <button
                  className="mis-drill-back min-h-11 focus-visible:active:!transform-none motion-reduce:transform-none"
                  type="button"
                  onClick={showAggregate}
                >
                  {statementSelection.node.budgetComponent}
                </button>
              ) : statementSelection ? (
                statementSelection.breadcrumb.map((crumb, index) => (
                  <span key={`${crumb}-${index}`}>
                    {index > 0 && <span aria-hidden="true">›</span>}
                    <span>{crumb}</span>
                  </span>
                ))
              ) : (
                <span>Ask answer</span>
              )}
            </div>
            <h2 id="mis-drill-title">{title}</h2>
            <div className="mis-drill-total">
              <strong>
                {isError || transactionReplaced
                  ? "Transactions unavailable"
                  : isTransactionView
                    ? transactionFoots
                      ? formatMoney(clickedActual)
                      : "Total withheld"
                    : aggregateTotals!.foots
                      ? formatMoney(clickedActual)
                      : "Total withheld"}
              </strong>
              {!isError && !transactionReplaced && (
                <span>
                  {isAsk ? "Ask answer" : formatBlockHeading(clickedMeasure!)} ·{" "}
                  {isTransactionView
                    ? result
                      ? `${result.totalCount} ${result.totalCount === 1 ? "line" : "lines"}`
                      : "Loading transactions…"
                    : `${leaves.length} ${leaves.length === 1 ? "line" : "lines"}`}
                </span>
              )}
            </div>
          </div>
          <button
            className="mis-drill-close !h-11 !w-11 focus-visible:active:!transform-none motion-reduce:transform-none"
            type="button"
            aria-label="Close drill-down"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        {isTransactionView ? (
          <TransactionBody
            result={result}
            clickedActual={clickedActual}
            pending={isPending}
            error={error}
            page={page}
            onPage={setPage}
            source={isAsk ? "ask" : "statement"}
          />
        ) : (
          <AggregateBody
            leaves={leaves}
            blockKey={statementSelection!.blockKey}
            totalMeasure={clickedMeasure!}
            totals={aggregateTotals!}
            leafButtons={leafButtons.current}
            onOpen={openLeaf}
          />
        )}
      </div>
    </div>
  );
}

function isAskSelection(selection: AnyDrillPanelSelection): selection is AskDrillPanelSelection {
  return "kind" in selection && selection.kind === "ask";
}

function TransactionBody({
  result,
  clickedActual,
  pending,
  error,
  page,
  onPage,
  source,
}: Readonly<{
  result: MisDrillResponse | AskDrillResponse | null;
  clickedActual: FixedScaleMoney;
  pending: boolean;
  error: Error | null;
  page: number;
  onPage: (page: number) => void;
  source: "statement" | "ask";
}>) {
  if (error) {
    const status = "status" in error && typeof error.status === "number" ? error.status : 0;
    const copy = source === "ask" ? askDrillError(status) : statementDrillError(status);
    return (
      <div className="mis-drill-state min-w-0 w-full" role="alert">
        <strong>{copy[0]}</strong>
        <span className="w-full max-w-full">{copy[1]}</span>
      </div>
    );
  }
  if (!result)
    return (
      <div className="mis-drill-state" role="status">
        Loading transactions…
      </div>
    );

  const foots = toPaise(result.footer.value) === toPaise(clickedActual);
  const first = result.totalCount === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const last = result.totalCount === 0 ? 0 : first + result.lines.length - 1;
  const replaced = result.batchStatuses.filter(({ status }) => status === "replaced");
  if (source === "statement" && replaced.length > 0)
    return (
      <div className="mis-drill-state" role="alert">
        <strong>Statement batches replaced since generation</strong>
        <span>{replaced.map(({ source, period }) => `${source} — ${formatMonth(period)}`).join("; ")}</span>
        <span>Generate the statement again before opening its transactions.</span>
      </div>
    );
  return (
    <>
      <div className="mis-drill-sort">
        <span>Sorted</span>
        <span className="mis-drill-chip">Value ↓</span>
        <span className="mis-drill-chip">Month ↓</span>
        {pending && <span role="status">Loading page…</span>}
      </div>
      {source === "ask" && replaced.length > 0 ? (
        <div className="mis-drill-notice min-w-0 w-full" role="status">
          {ASK_RELOADED_NOTICE}
        </div>
      ) : source === "ask" && "notice" in result && result.notice ? (
        <div className="mis-drill-notice min-w-0 w-full" role="status">
          {result.notice}
        </div>
      ) : null}
      {!foots && (
        <div className="mis-drill-notice" role="alert">
          <strong>Total withheld</strong>
          <span>The transaction total does not foot to this statement line’s Actual.</span>
        </div>
      )}
      <div className="mis-drill-table-scroll min-w-0 w-full">
        <table className="mis-drill-table mis-drill-transactions" style={{ minWidth: 1300, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 92 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 124 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 208 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr style={{ whiteSpace: "nowrap" }}>
              <th scope="col">Month</th>
              <th scope="col">Posting date</th>
              <th scope="col">Document no.</th>
              <th scope="col">Cost centre</th>
              <th scope="col">Account name</th>
              <th scope="col">Debit</th>
              <th scope="col">Credit</th>
              <th scope="col">Value</th>
              <th scope="col">Reference</th>
              <th scope="col">Memo</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.length === 0 ? (
              <tr>
                <td colSpan={10}>No transactions match this Actual.</td>
              </tr>
            ) : (
              result.lines.map((line, index) => (
                <tr key={`${result.page}-${index}`}>
                  <td>{formatMonth(line.month)}</td>
                  <td>{formatDate(line.postingDate)}</td>
                  <td>{line.txnNo}</td>
                  <td>{line.costCenter}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{line.accountName}</td>
                  <td data-numeric="true">{formatMoney(line.debit)}</td>
                  <td data-numeric="true">{formatMoney(line.credit)}</td>
                  <td data-numeric="true">{formatMoney(line.value)}</td>
                  <td>{line.reference ?? "—"}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{line.memo ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="mis-drill-foot" aria-label={foots ? "Total" : "Total withheld"}>
              <th colSpan={5} scope="row">
                {foots ? "Total" : "Total withheld"}
              </th>
              {foots ? (
                <>
                  <MoneyTotal value={result.footer.debit} />
                  <MoneyTotal value={result.footer.credit} />
                  <MoneyTotal value={result.footer.value} />
                  <td colSpan={2}>
                    <small>Matches the Actual in the {source === "ask" ? "answer" : "report"}</small>
                  </td>
                </>
              ) : (
                <td colSpan={5}>The total is withheld until the statement is generated again.</td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      <nav className="mis-drill-pagination" aria-label="Transaction pages">
        <span>
          {result.totalCount} matching · rows {first}–{last} on screen
        </span>
        <div>
          <button
            className="min-h-11 min-w-11 focus-visible:active:!transform-none motion-reduce:transform-none"
            type="button"
            disabled={pending || page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {result.page}</span>
          <button
            className="min-h-11 min-w-11 focus-visible:active:!transform-none motion-reduce:transform-none"
            type="button"
            disabled={pending || last >= result.totalCount}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      </nav>
    </>
  );
}

function statementDrillError(status: number): [string, string] {
  return status === 409
    ? ["Statement out of date", "Generate the statement again before opening its transactions."]
    : status === 403
      ? [
          "Transactions are not available",
          "Your access does not include these lines. Ask an administrator if you need access.",
        ]
      : ["Transactions could not be loaded", "Try opening this Actual again."];
}

function askDrillError(status: number): [string, string] {
  const message =
    status === 410
      ? "This answer is too old to open. Ask again to open its transactions."
      : status === 403
        ? "Your access has changed since this answer was shown. Ask again."
        : status === 409
          ? "The data behind this answer is no longer available. Ask again to open its transactions."
          : status === 400
            ? "This line cannot be opened. Ask again."
            : "Transactions could not be opened right now. Try again.";
  return ["Transactions could not be opened", message];
}

function MoneyTotal({ value }: Readonly<{ value: FixedScaleMoney }>) {
  return (
    <td data-numeric="true">
      {formatMoney(value)}
      <small>
        <span>{formatExactMoney(value)}</span>
        <span>exact</span>
      </small>
    </td>
  );
}

function AggregateBody({
  leaves,
  blockKey,
  totalMeasure,
  totals,
  leafButtons,
  onOpen,
}: Readonly<{
  leaves: MisStatementNode[];
  blockKey: MisStatementMeasureBlock["key"];
  totalMeasure: MisStatementMeasureBlock;
  totals: ReturnType<typeof aggregateTotal>;
  leafButtons: Map<string, HTMLButtonElement>;
  onOpen: (node: MisStatementNode) => void;
}>) {
  return (
    <>
      <div className="mis-drill-sort">
        <span>Sorted</span>
        <span className="mis-drill-chip">Statement outline order</span>
      </div>
      <div className="mis-drill-table-scroll">
        <table className="mis-drill-table">
          <thead>
            <tr>
              <th scope="col">S.No</th>
              <th scope="col">Sub-line</th>
              <th scope="col">GL code</th>
              <th scope="col">Budget</th>
              <th scope="col">Actual</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leaf) => {
              const measure = measureFor(leaf, blockKey);
              const budgetNotLoaded = isBudgetNotLoaded(measure);
              return (
                <tr key={leaf.nodeKey}>
                  <td>{leaf.sNo}</td>
                  <th scope="row">{leaf.budgetComponent}</th>
                  <td>{leaf.glCode}</td>
                  <td data-numeric="true" aria-label={budgetNotLoaded ? BUDGET_NOT_LOADED_LABEL : undefined}>
                    {budgetNotLoaded ? "–" : formatMoney(measure.budget)}
                  </td>
                  <td data-numeric="true">
                    <button
                      ref={(button) =>
                        button ? void leafButtons.set(leaf.nodeKey, button) : void leafButtons.delete(leaf.nodeKey)
                      }
                      className="mis-actual-action"
                      type="button"
                      onClick={() => onOpen(leaf)}
                    >
                      {formatMoney(measure.actual)}
                    </button>
                  </td>
                  <td data-numeric="true" aria-label={budgetNotLoaded ? BUDGET_NOT_LOADED_LABEL : undefined}>
                    {budgetNotLoaded ? "–" : formatPercentage(measure.percentage)}
                  </td>
                </tr>
              );
            })}
            <tr className="mis-drill-foot" aria-label="Total">
              <th colSpan={2} scope="row">
                {totals.foots ? "Total" : "Total withheld"}
              </th>
              <td />
              {isBudgetNotLoaded(totalMeasure) ? (
                <>
                  <td data-numeric="true" aria-label={BUDGET_NOT_LOADED_LABEL}>
                    –
                  </td>
                  {totals.foots ? (
                    <MoneyTotal value={fromPaise(totals.actualPaise)} />
                  ) : (
                    <td data-numeric="true">Total withheld</td>
                  )}
                  <td data-numeric="true" aria-label={BUDGET_NOT_LOADED_LABEL}>
                    –
                  </td>
                </>
              ) : totals.foots && totals.budgetPaise !== null ? (
                <>
                  <MoneyTotal value={fromPaise(totals.budgetPaise)} />
                  <MoneyTotal value={fromPaise(totals.actualPaise)} />
                  <td data-numeric="true">{derivedPercentage(totals.budgetPaise, totals.actualPaise)}</td>
                </>
              ) : (
                <td colSpan={3} role="alert">
                  The descendant leaves do not foot to this statement line’s Budget and Actual, so the total is
                  withheld.
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function aggregateTotal(selection: StatementDrillPanelSelection, leaves: MisStatementNode[]) {
  const measures = leaves.map((leaf) => measureFor(leaf, selection.blockKey));
  const actualPaise = measures.reduce((total, measure) => total + toPaise(measure.actual), ZERO);
  const clicked = measureFor(selection.node, selection.blockKey);
  if (isBudgetNotLoaded(clicked)) {
    return {
      budgetPaise: null,
      actualPaise,
      foots: actualPaise === toPaise(clicked.actual),
    };
  }
  const budgetPaise = measures.reduce(
    (total, measure) => (isBudgetNotLoaded(measure) ? total : total + toPaise(measure.budget)),
    ZERO,
  );
  return {
    budgetPaise,
    actualPaise,
    foots: budgetPaise === toPaise(clicked.budget) && actualPaise === toPaise(clicked.actual),
  };
}

function flattenLeaves(nodes: MisStatementNode[]): MisStatementNode[] {
  return nodes.flatMap((node) => (node.children.length === 0 ? [node] : flattenLeaves(node.children)));
}
function measureFor(node: MisStatementNode, key: MisStatementMeasureBlock["key"]): MisStatementMeasureBlock {
  const measure = node.measures.find((candidate) => candidate.key === key);
  if (!measure) throw new Error(`Statement measure block ${key} is missing`);
  return measure;
}
function toPaise(value: FixedScaleMoney): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  const paise = BigInt(whole) * ONE_HUNDRED + BigInt(fraction);
  return negative ? -paise : paise;
}
function fromPaise(value: bigint): FixedScaleMoney {
  const absolute = value < ZERO ? -value : value;
  return `${value < ZERO ? "-" : ""}${absolute / ONE_HUNDRED}.${String(absolute % ONE_HUNDRED).padStart(2, "0")}` as FixedScaleMoney;
}
function dateAtUtc(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}
function formatMonth(value: string): string {
  return monthFormatter.format(dateAtUtc(value));
}
function formatDate(value: string): string {
  return dateFormatter.format(dateAtUtc(value));
}
function derivedPercentage(budget: bigint, actual: bigint): string {
  if (budget === ZERO) {
    if (actual === ZERO) return "NA";
    return actual > ZERO ? "over-budget" : "credit / negative actual";
  }
  const numerator = actual * ONE_THOUSAND;
  const negative = numerator < ZERO !== budget < ZERO;
  const absoluteNumerator = numerator < ZERO ? -numerator : numerator;
  const absoluteBudget = budget < ZERO ? -budget : budget;
  const absolute = (absoluteNumerator + absoluteBudget / BigInt(2)) / absoluteBudget;
  return `${negative ? "−" : ""}${absolute / TEN}${absolute % TEN === ZERO ? "" : `.${absolute % TEN}`}%`;
}
