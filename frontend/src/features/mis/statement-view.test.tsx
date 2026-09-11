import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementResolvedResponse,
  MisStatementRunResponse,
} from "@3f/contract";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { StatementView } from "./statement-view";

const selected = (budget: FixedScaleMoney, actual: FixedScaleMoney, percentage: string | null) =>
  measure("selected", budget, actual, percentage);
const ytd = (budget: FixedScaleMoney, actual: FixedScaleMoney, percentage: string | null) =>
  measure("fy26-27-ytd", budget, actual, percentage);

const resolved: MisStatementResolvedResponse = {
  outcome: "resolved",
  scope: {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    costCentres: ["Primary"],
    glCodes: ["5001", "5002"],
    misFormat: "nursery-mis-financial-v1",
  },
  tree: [
    {
      nodeKey: "materials",
      sNo: "4",
      budgetComponent: "Materials",
      glCode: null,
      measures: [selected("999.00", "444.00", "0.444"), ytd("1999.00", "888.00", "0.444")],
      children: [
        {
          nodeKey: "shade",
          sNo: "4.1",
          budgetComponent: "Shade Net",
          glCode: "5001",
          measures: [selected("10.00", "5.00", "0.5"), ytd("20.00", "10.00", "0.5")],
          children: [],
        },
        {
          nodeKey: "vehicle",
          sNo: "4.2",
          budgetComponent: "Vehicle",
          glCode: null,
          measures: [selected("30.00", "15.00", "0.5"), ytd("60.00", "30.00", "0.5")],
          children: [
            {
              nodeKey: "diesel",
              sNo: null,
              budgetComponent: "Diesel",
              glCode: "5002",
              measures: [selected("20.00", "10.00", "0.5"), ytd("40.00", "20.00", "0.5")],
              children: [],
            },
          ],
        },
      ],
    },
  ],
  grandTotal: {
    nodeKey: "grand-total",
    sNo: null,
    budgetComponent: "Grand Total",
    glCode: null,
    measures: [selected("1500.00", "750.00", "0.5"), ytd("3000.00", "1500.00", "0.5")],
    children: [],
  },
  provenance: {
    activeBatchIds: [
      { source: "actuals", period: "2026-07-01", batchId: "actual-batch-july" },
      { source: "budget", period: "2026-07-01", batchId: "budget-batch-july" },
    ],
  },
};

afterEach(cleanup);

test("the statement renders inline below the selector as a tree in outline order showing the routes parent subtotals and a grand total without recomputing them", () => {
  render(<StatementView response={resolved} />);

  const table = screen.getByRole("treegrid", { name: "Financial MIS statement" });
  const rows = within(table)
    .getAllByRole("row")
    .filter((row) => row.hasAttribute("aria-level"));
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("4Materials"),
    expect.stringContaining("4.1Shade Net5001"),
    expect.stringContaining("4.2Vehicle"),
    expect.stringContaining("Diesel5002"),
  ]);
  expect(rows.map((row) => row.getAttribute("aria-level"))).toEqual(["1", "2", "2", "3"]);
  expect(rows[0]).toHaveTextContent("₹999");
  expect(screen.getByRole("row", { name: "Grand total" })).toHaveTextContent("₹1,500");
});

test("block headings use the spec labels formatted from each blocks range and money renders in indian grouping rounded to the rupee with rollover empty", () => {
  const response = {
    ...resolved,
    tree: [
      {
        ...resolved.tree[0],
        measures: [selected("1234567.50", "-1234.50", "0.5"), ytd("1234567.49", "1234.49", "0.5")],
        children: [],
      },
    ],
  };
  render(<StatementView response={response} />);

  expect(screen.getByRole("columnheader", { name: "July 2026" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "FY 26-27 (YTD to Jul)" })).toBeInTheDocument();
  const cells = within(screen.getByRole("row", { name: /Materials/ })).getAllByRole("gridcell");
  expect(cells[2]).toHaveTextContent("₹12,34,568");
  expect(cells[3]).toBeEmptyDOMElement();
  expect(cells[4]).toHaveTextContent("−₹1,235");
  expect(cells[7]).toBeEmptyDOMElement();
});

test("a non numeric percentage label is kept verbatim a null percentage renders as NA and a single block response renders one block", () => {
  const response: MisStatementResolvedResponse = {
    ...resolved,
    tree: [
      { ...resolved.tree[0], measures: [selected("0.00", "10.00", "over-budget")], children: [] },
      {
        nodeKey: "credit",
        sNo: "5",
        budgetComponent: "Credit",
        glCode: "5003",
        measures: [selected("0.00", "0.00", null)],
        children: [],
      },
    ],
    grandTotal: { ...resolved.grandTotal, measures: [selected("0.00", "10.00", "over-budget")] },
  };
  render(<StatementView response={response} />);

  expect(screen.getAllByRole("columnheader", { name: /July 2026|FY 26-27/ })).toHaveLength(1);
  expect(screen.getByRole("row", { name: /Materials/ })).toHaveTextContent("over-budget");
  expect(screen.getByRole("row", { name: /Credit/ })).toHaveTextContent("NA");
});

test("an unresolvable outcome shows the notice with no statement table while a resolved selection with no transactions shows the configured statement with zeros and no notice", () => {
  const unresolvable: MisStatementRunResponse = {
    outcome: "unresolvable",
    notice: "No mapping configured",
    tree: [],
    grandTotal: null,
    provenance: { activeBatchIds: [] },
  };
  const { rerender } = render(<StatementView response={unresolvable} />);
  expect(screen.getByText("No mapping configured")).toBeInTheDocument();
  expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();

  rerender(
    <StatementView
      response={{
        ...resolved,
        tree: [
          {
            ...resolved.tree[0],
            measures: [selected("0.00", "0.00", null), ytd("0.00", "0.00", null)],
            children: [],
          },
        ],
        grandTotal: {
          ...resolved.grandTotal,
          measures: [selected("0.00", "0.00", null), ytd("0.00", "0.00", null)],
        },
      }}
    />,
  );
  expect(screen.queryByText("No mapping configured")).not.toBeInTheDocument();
  expect(screen.getByRole("treegrid")).toHaveTextContent("Materials");
  expect(screen.getByRole("treegrid")).toHaveTextContent("₹0");
});

test("the unmapped GL line renders with a blank gl code and its own actual and the statement names its active period and contributing batch ids", () => {
  render(
    <StatementView
      response={{
        ...resolved,
        tree: [
          ...resolved.tree,
          {
            nodeKey: "unmapped-GL",
            sNo: null,
            budgetComponent: "unmapped-GL",
            glCode: null,
            measures: [selected("0.00", "333.49", "over-budget"), ytd("0.00", "333.49", "over-budget")],
            children: [],
          },
        ],
      }}
    />,
  );

  const cells = within(screen.getByRole("row", { name: /unmapped-GL/ })).getAllByRole("gridcell");
  expect(cells[1]).toBeEmptyDOMElement();
  expect(cells[4]).toHaveTextContent("₹333");
  expect(screen.getByText("Active period: July 2026")).toBeInTheDocument();
  expect(screen.getByText(/actual-batch-july/)).toBeInTheDocument();
  expect(screen.getByText(/budget-batch-july/)).toBeInTheDocument();
});

function measure(
  key: MisStatementMeasureBlock["key"],
  budget: FixedScaleMoney,
  actual: FixedScaleMoney,
  percentage: string | null,
): MisStatementMeasureBlock {
  return {
    key,
    label: key === "selected" ? "raw selected label" : "raw ytd label",
    from: key === "selected" ? "2026-07-01" : "2026-04-01",
    to: "2026-07-01",
    budget,
    rollover: null,
    actual,
    percentage,
    sourcePresence: ["matched"],
  };
}
