import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementRunResponse,
} from "@3f/contract";
import { Fragment } from "react";

const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const percentageFormatter = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });

export function StatementView({ response }: Readonly<{ response: MisStatementRunResponse }>) {
  if (response.outcome === "unresolvable") {
    return (
      <div className="mis-results" aria-live="polite">
        <div className="mis-notice" role="status">
          <strong>{response.notice}</strong>
          <span>This selection has no governed statement scope yet.</span>
        </div>
      </div>
    );
  }

  const blocks = response.grandTotal.measures;
  const activeBlock = blocks.find(({ key }) => key === "selected") ?? blocks[0];

  return (
    <section className="mis-statement" aria-labelledby="mis-statement-title" aria-live="polite">
      <header className="mis-statement-header">
        <div>
          <p className="mis-eyebrow">Financial statement</p>
          <h2 id="mis-statement-title">
            {response.scope.function} — {response.scope.plant}
          </h2>
        </div>
        <p>Active period: {formatBlockHeading(activeBlock)}</p>
      </header>

      <div className="mis-statement-scroll">
        <table className="mis-statement-table" role="treegrid" aria-label="Financial MIS statement">
          <thead>
            <tr role="row">
              <th className="mis-statement-identity-heading" colSpan={3} scope="colgroup">
                Identity
              </th>
              {blocks.map((block) => (
                <th className="mis-statement-period-heading" colSpan={4} scope="colgroup" key={block.key}>
                  {formatBlockHeading(block)}
                </th>
              ))}
            </tr>
            <tr role="row">
              <th className="mis-statement-sno" scope="col">
                S. No.
              </th>
              <th className="mis-statement-component" scope="col">
                Budget Component
              </th>
              <th className="mis-statement-gl" scope="col">
                GL code
              </th>
              {blocks.map((block) => (
                <Fragment key={block.key}>
                  <th scope="col">Budget</th>
                  <th scope="col">Roll-over</th>
                  <th scope="col">Actual</th>
                  <th className="mis-statement-block-end" scope="col">
                    %
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {response.tree.map((node) => (
              <StatementRow node={node} blocks={blocks} level={1} key={node.nodeKey} />
            ))}
          </tbody>
          <tfoot>
            <tr role="row" aria-label="Grand total">
              <th colSpan={3} scope="row" role="rowheader">
                Grand total
              </th>
              {blocks.map((block, index) => (
                <MeasureCells measure={response.grandTotal.measures[index]} key={block.key} />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="mis-statement-provenance">
        <span>Amounts in ₹. All configured budget components are shown.</span>
        <span>
          Contributing batch IDs:{" "}
          {response.provenance.activeBatchIds.map(({ batchId }) => batchId).join(", ") || "None"}
        </span>
      </footer>
    </section>
  );
}

function StatementRow({
  node,
  blocks,
  level,
}: Readonly<{ node: MisStatementNode; blocks: MisStatementMeasureBlock[]; level: number }>) {
  const parent = node.children.length > 0;
  return (
    <>
      <tr
        role="row"
        className="mis-statement-row"
        data-parent={parent || undefined}
        aria-level={level}
        aria-expanded={parent || undefined}
      >
        <td role="gridcell" className="mis-statement-sno">
          {node.sNo}
        </td>
        <th
          className="mis-statement-component"
          scope="row"
          role="rowheader"
          style={{ paddingInlineStart: `${10 + (level - 1) * 16}px` }}
        >
          {node.budgetComponent}
        </th>
        <td role="gridcell" className="mis-statement-gl">
          {node.glCode}
        </td>
        {blocks.map((block, index) => (
          <MeasureCells measure={node.measures[index]} key={block.key} />
        ))}
      </tr>
      {node.children.map((child) => (
        <StatementRow node={child} blocks={blocks} level={level + 1} key={child.nodeKey} />
      ))}
    </>
  );
}

function MeasureCells({ measure }: Readonly<{ measure: MisStatementMeasureBlock }>) {
  return (
    <>
      <td role="gridcell" data-numeric="true">
        {formatMoney(measure.budget)}
      </td>
      <td role="gridcell" data-numeric="true" aria-label="Roll-over unavailable" />
      <td role="gridcell" data-numeric="true">
        {formatMoney(measure.actual)}
      </td>
      <td role="gridcell" className="mis-statement-block-end" data-numeric="true">
        {formatPercentage(measure.percentage)}
      </td>
    </>
  );
}

function formatBlockHeading(block: MisStatementMeasureBlock): string {
  const to = dateAtUtc(block.to);
  if (block.key === "fy26-27-ytd") {
    const startYear = Number(block.from.slice(0, 4));
    return `FY ${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)} (YTD to ${shortMonthFormatter.format(to)})`;
  }
  return monthFormatter.format(to);
}

function dateAtUtc(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function formatMoney(value: FixedScaleMoney): string {
  const negative = value.startsWith("-");
  const [whole, paise] = value.replace("-", "").split(".");
  const rounded = BigInt(whole) + (paise >= "50" ? BigInt(1) : BigInt(0));
  const digits = rounded.toString();
  const lastThree = digits.slice(-3);
  const leading = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative && rounded !== BigInt(0) ? "−" : ""}₹${leading ? `${leading},` : ""}${lastThree}`;
}

function formatPercentage(value: string | null): string {
  if (value === null) return "NA";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? percentageFormatter.format(numeric) : value;
}
