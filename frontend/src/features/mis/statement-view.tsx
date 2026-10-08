"use client";

import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
  MisStatementRunResponse,
} from "@3f/contract";
import { Fragment } from "react";
import { Button } from "@/src/components/ui/button";
import type { DrillPanelSelection } from "./drill-panel";
import { useMisStatementExport } from "./use-mis-statement";

const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const percentageFormatter = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });
export const BUDGET_NOT_LOADED_LABEL = "Budget not loaded for this plant";
export type DrillPanelTarget = Omit<DrillPanelSelection, "opener">;

export function StatementView({
  response,
  onOpenDrill,
}: Readonly<{
  response: MisStatementRunResponse;
  onOpenDrill: (target: DrillPanelTarget, opener: HTMLButtonElement) => void;
}>) {
  const download = useMisStatementExport();

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
    <section
      className="mis-statement"
      aria-labelledby="mis-statement-title"
      aria-live="polite"
      aria-busy={download.isPending}
    >
      <header className="mis-statement-header">
        <div>
          <p className="mis-eyebrow">Financial statement</p>
          <h2 id="mis-statement-title">
            {response.scope.function} — {response.scope.plantDisplay ?? response.scope.plant}
            {response.scope.provisional && <span className="mis-provisional-label">Provisional labels</span>}
          </h2>
        </div>
        <div className="mis-statement-actions">
          <p>Active period: {formatBlockHeading(activeBlock)}</p>
          <Button
            className="mis-download"
            type="button"
            disabled={download.isPending}
            onClick={() =>
              download.mutate({
                department: response.scope.department,
                function: response.scope.function,
                plant: response.scope.plant,
                period: response.scope.period,
              })
            }
          >
            {download.isPending ? "Downloading…" : "Download Excel"}
          </Button>
        </div>
      </header>

      {download.data && (
        <div className="mis-notice mis-download-notice" role="status">
          <strong>{download.data.notice}</strong>
          <span>Generate the statement again before downloading.</span>
        </div>
      )}
      {download.isError && (
        <div className="mis-notice mis-download-notice" role="alert">
          <strong>Download failed</strong>
          <span>The workbook could not be downloaded. Try again.</span>
        </div>
      )}

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
              <StatementRow
                node={node}
                blocks={blocks}
                level={1}
                breadcrumb={[]}
                response={response}
                onOpen={onOpenDrill}
                key={node.nodeKey}
              />
            ))}
          </tbody>
          <tfoot>
            <tr role="row" aria-label="Grand total">
              <th colSpan={3} scope="row" role="rowheader">
                Grand total
              </th>
              {blocks.map((block, index) => (
                <MeasureCells
                  measure={response.grandTotal.measures[index]}
                  onOpen={(opener) =>
                    onOpenDrill(
                      {
                        node: response.grandTotal,
                        roots: response.tree,
                        blockKey: block.key,
                        breadcrumb: [response.grandTotal.budgetComponent],
                        response,
                      },
                      opener,
                    )
                  }
                  key={block.key}
                />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="mis-statement-provenance">
        <span>Click any Actual to see its transactions. Budget is not drillable.</span>
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
  breadcrumb,
  response,
  onOpen,
}: Readonly<{
  node: MisStatementNode;
  blocks: MisStatementMeasureBlock[];
  level: number;
  breadcrumb: string[];
  response: MisStatementResolvedResponse;
  onOpen: (target: DrillPanelTarget, opener: HTMLButtonElement) => void;
}>) {
  const parent = node.children.length > 0;
  const path = [...breadcrumb, node.budgetComponent];
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
          <MeasureCells
            measure={node.measures[index]}
            onOpen={(opener) =>
              onOpen(
                {
                  node,
                  roots: parent ? node.children : [],
                  blockKey: block.key,
                  breadcrumb: path,
                  response,
                },
                opener,
              )
            }
            key={block.key}
          />
        ))}
      </tr>
      {node.children.map((child) => (
        <StatementRow
          node={child}
          blocks={blocks}
          level={level + 1}
          breadcrumb={path}
          response={response}
          onOpen={onOpen}
          key={child.nodeKey}
        />
      ))}
    </>
  );
}

function MeasureCells({
  measure,
  onOpen,
}: Readonly<{ measure: MisStatementMeasureBlock; onOpen?: (opener: HTMLButtonElement) => void }>) {
  const actual = (
    <td role="gridcell" data-numeric="true">
      {onOpen ? (
        <button
          className="mis-actual-action"
          type="button"
          aria-label={`Drill down Actual ${formatMoney(measure.actual)} for ${measure.label}`}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {formatMoney(measure.actual)}
        </button>
      ) : (
        formatMoney(measure.actual)
      )}
    </td>
  );
  if (isBudgetNotLoaded(measure)) {
    return (
      <>
        <td role="gridcell" data-numeric="true" aria-label={BUDGET_NOT_LOADED_LABEL}>
          –
        </td>
        <td role="gridcell" data-numeric="true" aria-label={BUDGET_NOT_LOADED_LABEL}>
          –
        </td>
        {actual}
        <td
          role="gridcell"
          className="mis-statement-block-end"
          data-numeric="true"
          aria-label={BUDGET_NOT_LOADED_LABEL}
        >
          –
        </td>
      </>
    );
  }
  return (
    <>
      <td role="gridcell" data-numeric="true">
        {formatMoney(measure.budget)}
      </td>
      <td role="gridcell" data-numeric="true">
        {formatMoney(measure.rollover)}
      </td>
      {actual}
      <td role="gridcell" className="mis-statement-block-end" data-numeric="true">
        {formatPercentage(measure.percentage)}
      </td>
    </>
  );
}

export function isBudgetNotLoaded(
  block: MisStatementMeasureBlock,
): block is MisStatementMeasureBlock & { budgetState: "not-loaded" } {
  return block.budgetState === "not-loaded";
}

export function formatBlockHeading(block: MisStatementMeasureBlock): string {
  const to = dateAtUtc(block.to);
  if (block.from.slice(0, 7) !== block.to.slice(0, 7)) {
    const startYear = Number(block.from.slice(0, 4));
    return `FY ${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)} (YTD to ${shortMonthFormatter.format(to)})`;
  }
  return monthFormatter.format(to);
}

function dateAtUtc(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function formatMoney(value: FixedScaleMoney): string {
  const negative = value.startsWith("-");
  const [whole, paise] = value.replace("-", "").split(".");
  const rounded = BigInt(whole) + (paise >= "50" ? BigInt(1) : BigInt(0));
  return `${negative && rounded !== BigInt(0) ? "−" : ""}₹${formatRupeeDigits(rounded.toString())}`;
}

export function formatExactMoney(value: FixedScaleMoney): string {
  const negative = value.startsWith("-");
  const [whole, paise] = value.replace("-", "").split(".");
  return `${negative && (whole !== "0" || paise !== "00") ? "−" : ""}₹${formatRupeeDigits(whole)}.${paise}`;
}

function formatRupeeDigits(digits: string): string {
  const lastThree = digits.slice(-3);
  const leading = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${leading ? `${leading},` : ""}${lastThree}`;
}

export function formatPercentage(value: string | null): string {
  if (value === null) return "NA";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? percentageFormatter.format(numeric) : value;
}
