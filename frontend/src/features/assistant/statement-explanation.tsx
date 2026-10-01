"use client";

import type {
  MisDrillBatchStatus,
  MisStatementMeasureBlock,
  MisStatementResolvedResponse,
  StatementGroundingRefusalReason,
  StatementGroundingResponse,
  StatementLeafExplanation,
} from "@3f/contract";
import { useMemo } from "react";
import { formatExactMoney, formatMoney } from "../mis/statement-view";
import { projectStatementDescendants } from "../mis/aggregate-projection.helper";

const transactionDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const refusalCopy: Record<StatementGroundingRefusalReason, string> = {
  "invalid-signature": "This statement context could not be verified. Generate the statement again.",
  "expired-context": "This statement context has expired. Generate the statement again.",
  "wrong-user": "This statement context belongs to another user. Generate your own statement to continue.",
  "node-metadata-mismatch": "The statement mapping details no longer match. Generate the statement again.",
  "node-amounts-mismatch": "The statement amounts no longer match. Generate the statement again.",
  "outline-mismatch": "The statement outline no longer matches. Generate the statement again.",
  "node-not-in-outline": "That line is not part of this statement. Click another Actual.",
  "block-not-in-outline": "That period is not part of this statement. Click another Actual.",
  "plant-not-authorized": "You no longer have access to this plant.",
  "pinned-batch-invalid": "The statement source data could not be verified. Generate the statement again.",
  "selection-mismatch": "The report selection no longer matches this statement. Generate the statement again.",
  "budget-subject-not-supported": "Budget cannot be explained from this surface. Click an Actual instead.",
  "footing-mismatch": "The transactions do not foot to this figure, so the explanation was withheld.",
};

export function StatementExplanation({
  response,
  statement,
  onOpenDrill,
}: Readonly<{
  response: StatementGroundingResponse;
  statement: MisStatementResolvedResponse;
  onOpenDrill: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
}>) {
  const aggregateLines = useMemo(
    () =>
      response.outcome === "aggregate" ? projectStatementDescendants(statement, response.nodeKey, response.block) : [],
    [response, statement],
  );
  switch (response.outcome) {
    case "focus-required":
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <h2>Choose a figure to explain</h2>
          <p>Click an Actual to choose the figure, then ask how it was built.</p>
        </article>
      );
    case "leaf":
      return <LeafExplanation response={response} onOpenDrill={onOpenDrill} />;
    case "replaced":
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <div className="statement-explanation-notice" role="status">
            <strong>This explanation uses a replaced batch</strong>
            <span>{response.notice}</span>
            <BatchStatuses statuses={response.replacedBatches} />
          </div>
          <LeafExplanation response={response} onOpenDrill={onOpenDrill} nested />
        </article>
      );
    case "aggregate": {
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <h2>Lines that compose this figure</h2>
          {response.budgetState === "not-loaded" && <p>Budget not loaded for this plant.</p>}
          <ul className="statement-explanation-lines">
            {aggregateLines.map((line) => (
              <li key={line.nodeKey}>
                <div>
                  <strong>{line.label}</strong>
                  <span>{mappingLabel(line.glCodes, line.costCentres)}</span>
                </div>
                <b>{formatMoney(line.actual)}</b>
              </li>
            ))}
          </ul>
          <OpenDrill nodeKey={response.nodeKey} block={response.block} onOpenDrill={onOpenDrill} />
        </article>
      );
    }
    case "gone":
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <h2>The pinned data is no longer available</h2>
          <p>Generate the statement again before asking about this figure.</p>
          <BatchStatuses statuses={response.batchStatuses} />
        </article>
      );
    case "audit-failure":
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <h2>Explanation withheld</h2>
          <p>{response.message}</p>
        </article>
      );
    case "refused":
      return (
        <article className="statement-explanation" data-outcome={response.outcome}>
          <h2>This figure cannot be explained from this statement</h2>
          <p>{refusalCopy[response.reason]}</p>
          {response.batchStatuses && <BatchStatuses statuses={response.batchStatuses} />}
        </article>
      );
  }
}

function LeafExplanation({
  response,
  onOpenDrill,
  nested = false,
}: Readonly<{
  response: StatementLeafExplanation;
  onOpenDrill: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
  nested?: boolean;
}>) {
  const content = (
    <>
      <h2>Transactions behind this figure</h2>
      {response.budgetState === "not-loaded" && <p>Budget not loaded for this plant.</p>}
      <ul className="statement-explanation-rollup">
        {response.rollup.map((entry) => (
          <li key={`${entry.plant}:${entry.costCentre}:${entry.glCode}`}>
            <strong>
              GL {entry.glCode} · {entry.costCentre} · {entry.bucket}
            </strong>
            {entry.provisional && <span>Provisional mapping</span>}
          </li>
        ))}
      </ul>
      <div className="statement-explanation-table-wrap">
        <table aria-label="Transactions behind this figure">
          <thead>
            <tr>
              <th scope="col">Posting date</th>
              <th scope="col">Reference</th>
              <th scope="col">Memo</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {response.transactions.lines.map((line, index) => (
              <tr key={`${line.postingDate}:${line.reference ?? ""}:${index}`}>
                <td>{transactionDateFormatter.format(new Date(`${line.postingDate.slice(0, 10)}T00:00:00Z`))}</td>
                <td>{line.reference ?? "—"}</td>
                <td>{line.memo ?? "—"}</td>
                <td data-numeric="true">{formatExactMoney(line.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3} scope="row">
                Exact total
              </th>
              <td data-numeric="true">{formatExactMoney(response.transactions.footer.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="statement-explanation-count">
        {response.transactions.totalCount} total lines · first {response.transactions.pageSize} shown
      </p>
      <OpenDrill nodeKey={response.nodeKey} block={response.block} onOpenDrill={onOpenDrill} />
    </>
  );
  return nested ? content : <article className="statement-explanation">{content}</article>;
}

function OpenDrill({
  nodeKey,
  block,
  onOpenDrill,
}: Readonly<{
  nodeKey: string;
  block: MisStatementMeasureBlock["key"];
  onOpenDrill: (nodeKey: string, block: MisStatementMeasureBlock["key"], opener: HTMLButtonElement) => void;
}>) {
  return (
    <button
      className="statement-explanation-open"
      type="button"
      onClick={(event) => onOpenDrill(nodeKey, block, event.currentTarget)}
    >
      Open full drill
    </button>
  );
}

function BatchStatuses({ statuses }: Readonly<{ statuses: MisDrillBatchStatus[] }>) {
  return <span>{statuses.map(({ source, period }) => `${source} · ${period}`).join("; ")}</span>;
}

function mappingLabel(glCodes: string[], costCentres: string[]): string {
  const gl = glCodes.length ? `GL ${glCodes.join(", ")}` : "No GL code in master";
  const costCentre = costCentres.length ? costCentres.join(", ") : "No cost centre in master";
  return `${gl} · ${costCentre}`;
}
