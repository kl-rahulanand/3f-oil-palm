"use client";

import type { FixedScaleMoney, MisStatementMeasureBlock, MisStatementNode } from "@3f/contract";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatMoney, formatPercentage } from "./statement-view";

export interface DrillPanelSelection {
  node: MisStatementNode;
  roots: MisStatementNode[];
  blockKey: MisStatementMeasureBlock["key"];
  breadcrumb: string[];
  opener: HTMLButtonElement;
}

const ZERO = BigInt(0);
const TEN = BigInt(10);
const ONE_HUNDRED = BigInt(100);
const ONE_THOUSAND = BigInt(1000);

export function DrillPanel({ selection, onClose }: Readonly<{ selection: DrillPanelSelection; onClose: () => void }>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const leaves = flattenLeaves(selection.roots);
  const measures = leaves.map((leaf) => measureFor(leaf, selection.blockKey));
  const budgetPaise = measures.reduce((total, measure) => total + toPaise(measure.budget), ZERO);
  const actualPaise = measures.reduce((total, measure) => total + toPaise(measure.actual), ZERO);
  const clickedMeasure = measureFor(selection.node, selection.blockKey);
  if (budgetPaise !== toPaise(clickedMeasure.budget) || actualPaise !== toPaise(clickedMeasure.actual)) {
    throw new Error("Drill panel totals do not foot to the clicked statement node");
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    return () => selection.opener.focus();
  }, [selection.opener]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])") ?? [],
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="mis-drill-layer">
      <div className="mis-drill-scrim" aria-hidden="true" data-testid="drill-scrim" onClick={onClose} />
      <div
        ref={dialogRef}
        className="mis-drill-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mis-drill-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="mis-drill-header">
          <div className="mis-drill-heading">
            <div className="mis-drill-breadcrumb">
              <span className="mis-eyebrow">Drill-down</span>
              <span className="mis-drill-divider" />
              {selection.breadcrumb.map((crumb, index) => (
                <span key={`${crumb}-${index}`}>
                  {index > 0 && <span aria-hidden="true">›</span>}
                  <span>{crumb}</span>
                </span>
              ))}
            </div>
            <h2 id="mis-drill-title">{selection.node.budgetComponent}</h2>
            <div className="mis-drill-total">
              <strong>{formatMoney(clickedMeasure.actual)}</strong>
              <span>
                {clickedMeasure.label} · {leaves.length} {leaves.length === 1 ? "line" : "lines"}
              </span>
            </div>
          </div>
          <button className="mis-drill-close" type="button" aria-label="Close drill-down" onClick={onClose}>
            ✕
          </button>
        </header>

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
                const measure = measureFor(leaf, selection.blockKey);
                return (
                  <tr key={leaf.nodeKey}>
                    <td>{leaf.sNo}</td>
                    <th scope="row">{leaf.budgetComponent}</th>
                    <td>{leaf.glCode}</td>
                    <td data-numeric="true">{formatMoney(measure.budget)}</td>
                    <td data-numeric="true">{formatMoney(measure.actual)}</td>
                    <td data-numeric="true">{formatPercentage(measure.percentage)}</td>
                  </tr>
                );
              })}
              <tr className="mis-drill-foot" aria-label="Total">
                <th colSpan={2} scope="row">
                  Total
                </th>
                <td />
                <td data-numeric="true">
                  {formatMoney(fromPaise(budgetPaise))}
                  <small>{fromPaise(budgetPaise)} exact</small>
                </td>
                <td data-numeric="true">
                  {formatMoney(fromPaise(actualPaise))}
                  <small>{fromPaise(actualPaise)} exact</small>
                </td>
                <td data-numeric="true">{derivedPercentage(budgetPaise, actualPaise)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
