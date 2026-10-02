import type {
  FixedScaleMoney,
  MisDrillResponse,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
} from "@3f/contract";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithQuery } from "@/src/test/render";
import { DrillPanel, type DrillPanelSelection } from "./drill-panel";
import { StatementView as OwnedStatementView, type DrillPanelTarget } from "./statement-view";

const mocks = vi.hoisted(() => ({
  misOptions: vi.fn(),
  runMisStatement: vi.fn(),
  runMisDrill: vi.fn(),
  exportMisStatement: vi.fn(),
  csrf: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/src/lib/api", () => ({ api: mocks }));

const diesel = node("diesel", "9.01.01", "Diesel", "5101", "10.01", "5.01", "20.02", "10.02");
const repairs = node("repairs", "9.01.02", "Repairs", "5102", "20.02", "10.02", "40.04", "20.04");
const stationery = node("stationery", "9.02", "Stationery", "5103", "30.03", "15.03", "60.06", "30.06");
const vehicle = node("vehicle", "9.01", "Vehicle Maintenance", null, "30.03", "15.03", "60.06", "30.06", [
  diesel,
  repairs,
]);
const admin = node("admin", "9", "Admin Expenses", null, "60.06", "30.06", "120.12", "60.12", [vehicle, stationery]);
const unmapped = node("unmapped-GL", null, "unmapped-GL", null, "0.00", "2.01", "0.00", "4.02");

const response: MisStatementResolvedResponse = {
  outcome: "resolved",
  scope: {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    costCentres: ["DUB-NUR"],
    glCodes: ["5101", "5102", "5103"],
    misFormat: "nursery-mis-financial-v1",
  },
  tree: [admin, unmapped],
  grandTotal: node("grand-total", null, "Grand Total", null, "60.06", "32.07", "120.12", "64.14"),
  provenance: {
    activeBatchIds: [
      { source: "actuals", period: "2026-07-01", batchId: "actuals-july" },
      { source: "budget", period: "2026-07-01", batchId: "budget-july" },
    ],
  },
};

afterEach(() => {
  cleanup();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

test("a non leaf actual opens the panel on all its descendant leaves and the total foots to the clicked node in exact paise at three levels", () => {
  renderWithQuery(<StatementView response={response} />);
  openActual("Admin Expenses", 0);

  const dialog = screen.getByRole("dialog", { name: "Admin Expenses" });
  const rows = within(dialog).getAllByRole("row").slice(1, -1);
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("Diesel"),
    expect.stringContaining("Repairs"),
    expect.stringContaining("Stationery"),
  ]);
  expect(dialog).not.toHaveTextContent("Vehicle Maintenance");
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("₹30.06exact");
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("₹30");
});

test("the panel renders the clicked measure block and foots to it when the financial year to date block differs from the selected month", () => {
  renderWithQuery(<StatementView response={response} />);
  openActual("Admin Expenses", 1);

  const dialog = screen.getByRole("dialog", { name: "Admin Expenses" });
  expect(within(dialog).getByRole("row", { name: /Diesel/ })).toHaveTextContent("₹20");
  expect(dialog).toHaveTextContent("FY 26-27 (YTD to Jul)");
  expect(dialog).not.toHaveTextContent("raw ytd label");
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("₹60.12exact");
});

test("the grand total opens the flattened roots of the statement tree including the unmapped gl line and foots to the grand total", () => {
  renderWithQuery(<StatementView response={response} />);
  const grandTotal = screen.getByRole("row", { name: "Grand total" });
  fireEvent.click(within(grandTotal).getAllByRole("button")[0]);

  const dialog = screen.getByRole("dialog", { name: "Grand Total" });
  expect(within(dialog).getByRole("row", { name: /unmapped-GL/ })).toBeInTheDocument();
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("₹32.07exact");
});

test("the exact paise line uses indian money grouping and labels the value without trailing prose", () => {
  const leaf = node("large-leaf", "1.1", "Large leaf", "5001", "10050136.29", "10050136.29", "0.00", "0.00");
  const parent = node("large-parent", "1", "Large parent", null, "10050136.29", "10050136.29", "0.00", "0.00", [leaf]);
  renderWithQuery(<StatementView response={{ ...response, tree: [parent], grandTotal: parent }} />);
  openActual("Large parent", 0);

  const exact = within(screen.getByRole("row", { name: "Total" })).getAllByText("exact");
  expect(exact[0].previousElementSibling).toHaveTextContent("₹1,00,50,136.29");
  expect(exact[1].previousElementSibling).toHaveTextContent("₹1,00,50,136.29");
});

test("a footing mismatch keeps the leaf rows visible and withholds the unverifiable total", () => {
  const divergentAdmin = { ...admin, measures: [measure("selected", "60.06", "30.07"), admin.measures[1]] };
  renderWithQuery(<StatementView response={{ ...response, tree: [divergentAdmin, unmapped] }} />);
  openActual("Admin Expenses", 0);

  const dialog = screen.getByRole("dialog", { name: "Admin Expenses" });
  expect(within(dialog).getByRole("row", { name: /Diesel/ })).toBeInTheDocument();
  expect(within(dialog).getByRole("row", { name: /Stationery/ })).toBeInTheDocument();
  expect(dialog.querySelector(".mis-drill-total strong")).toHaveTextContent(/^Total withheld$/);
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("Total withheld");
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "The descendant leaves do not foot to this statement line’s Budget and Actual, so the total is withheld.",
  );
});

test("the total row derives its percentage by the statement nil rules for a zero budget with no actual a positive actual and a negative actual", () => {
  for (const [actual, expected] of [
    ["0.00", "NA"],
    ["1.00", "over-budget"],
    ["-1.00", "credit / negative actual"],
  ] as const) {
    const leaf = node(`leaf-${actual}`, "1.1", "Leaf", "5001", "0.00", actual, "0.00", actual);
    const parent = node(`parent-${actual}`, "1", "Zero Budget", null, "0.00", actual, "0.00", actual, [leaf]);
    renderWithQuery(<StatementView response={{ ...response, tree: [parent], grandTotal: parent }} />);
    openActual("Zero Budget", 0);
    expect(within(screen.getByRole("dialog")).getByRole("row", { name: "Total" })).toHaveTextContent(expected);
    cleanup();
  }
});

test("opening a nested aggregate and the grand total issues no api call at all", () => {
  renderWithQuery(<StatementView response={response} />);
  openActual("Vehicle Maintenance", 0);
  fireEvent.click(screen.getByRole("button", { name: "Close drill-down" }));
  fireEvent.click(within(screen.getByRole("row", { name: "Grand total" })).getAllByRole("button")[0]);

  Object.values(mocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
});

test("the drill panel takes focus traps tab and shift tab closes on escape and on a scrim click and returns focus to the actual control that opened it", () => {
  renderWithQuery(<StatementView response={response} />);
  const opener = within(screen.getByRole("row", { name: /Admin Expenses/ })).getAllByRole("button")[0];
  fireEvent.click(opener);

  const dialog = screen.getByRole("dialog");
  const close = screen.getByRole("button", { name: "Close drill-down" });
  const last = within(dialog).getAllByRole("button").at(-1)!;
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();

  fireEvent.click(opener);
  fireEvent.click(screen.getByTestId("drill-scrim"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test("a leaf actual requests the drill with the displayed scope the clicked node and block and the provenance batches passed through verbatim", async () => {
  mocks.runMisDrill.mockResolvedValue(drillResponse());
  renderWithQuery(<StatementView response={response} />);
  openActual("Diesel", 0);

  await waitFor(() => expect(mocks.runMisDrill).toHaveBeenCalledTimes(1));
  const request = mocks.runMisDrill.mock.calls[0][0];
  expect(request).toEqual({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    nodeKey: "diesel",
    block: "selected",
    pinnedBatches: response.provenance.activeBatchIds,
    page: 1,
  });
  expect(request.pinnedBatches).toBe(response.provenance.activeBatchIds);
});

test("the transactions table shows document number cost centre and account name after posting date without changing server row order or the full result footer", async () => {
  mocks.runMisDrill.mockResolvedValue(
    drillResponse({
      totalCount: 101,
      lines: [
        {
          month: "2026-07-01",
          postingDate: "2026-07-20",
          txnNo: "DOC-B",
          costCenter: "DUB-NUR-B",
          accountName: "Repairs",
          debit: "4.00",
          credit: "0.00",
          value: "4.00",
          reference: "REF-B",
          memo: "Second",
        },
        {
          month: "2026-06-01",
          postingDate: "2026-06-04",
          txnNo: "DOC-A",
          costCenter: "DUB-NUR-A",
          accountName: "Diesel",
          debit: "1.00",
          credit: "0.00",
          value: "1.00",
          reference: "REF-A",
          memo: "First",
        },
      ],
    }),
  );
  renderWithQuery(<StatementView response={response} />);
  openActual("Diesel", 0);

  const table = await screen.findByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Month",
    "Posting date",
    "Document no.",
    "Cost centre",
    "Account name",
    "Debit",
    "Credit",
    "Value",
    "Reference",
    "Memo",
  ]);
  const rows = within(table).getAllByRole("row").slice(1, -1);
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("DOC-BDUB-NUR-BRepairs"),
    expect.stringContaining("DOC-ADUB-NUR-ADiesel"),
  ]);
  expect(within(table).getByRole("row", { name: "Total" })).toHaveTextContent("₹5.01exact");
  expect(within(table).getByRole("row", { name: "Total" })).toHaveTextContent("Matches the Actual in the report");
});

test("paging re-requests the next page and a failed next page clears the previous rows count and footer", async () => {
  let rejectNext!: (reason: Error) => void;
  mocks.runMisDrill.mockImplementation(({ page }: { page: number }) =>
    page === 1
      ? Promise.resolve(drillResponse({ totalCount: 101 }))
      : new Promise((_resolve, reject) => {
          rejectNext = reject;
        }),
  );
  renderWithQuery(<StatementView response={response} />);
  openActual("Diesel", 0);

  expect(await screen.findByText("101 matching · rows 1–1 on screen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(mocks.runMisDrill).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  expect(screen.getByText("101 matching · rows 1–1 on screen")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByText("Loading page…")).toBeInTheDocument();

  await act(async () => rejectNext(new Error("offline")));
  expect(await screen.findByRole("alert")).toHaveTextContent("Transactions could not be loaded");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText(/matching · rows/)).not.toBeInTheDocument();
  expect(screen.queryByText("Matches the Actual in the report")).not.toBeInTheDocument();
});

test("an empty transaction result renders a zero row state with a zero footer and not an error", async () => {
  const empty = node("empty", "1", "Empty leaf", "5999", "0.00", "0.00", "0.00", "0.00");
  mocks.runMisDrill.mockResolvedValue(
    drillResponse({
      nodeKey: "empty",
      leafKey: "empty",
      lines: [],
      totalCount: 0,
      footer: { debit: "0.00", credit: "0.00", value: "0.00" },
    }),
  );
  renderWithQuery(<StatementView response={{ ...response, tree: [empty], grandTotal: empty }} />);
  openActual("Empty leaf", 0);

  expect(await screen.findByText("No transactions match this Actual.")).toBeInTheDocument();
  expect(screen.getByText("0 matching · rows 0–0 on screen")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Total" })).toHaveTextContent("₹0.00exact");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("every replaced pinned batch is named and a stale pin refuses and tells the reader to generate the statement again", async () => {
  mocks.runMisDrill.mockResolvedValueOnce(
    drillResponse({
      batchStatuses: [
        {
          source: "actuals",
          period: "2026-06-01",
          requestedBatchId: "old-june",
          status: "replaced",
          activeBatchId: "new-june",
        },
        {
          source: "actuals",
          period: "2026-07-01",
          requestedBatchId: "old-july",
          status: "replaced",
          activeBatchId: "new-july",
        },
      ],
    }),
  );
  renderWithQuery(<StatementView response={response} />);
  openActual("Diesel", 0);
  const replaced = await screen.findByRole("alert");
  const replacedDialog = screen.getByRole("dialog", { name: "Diesel" });
  expect(replaced).toHaveTextContent("actuals — Jun 2026; actuals — Jul 2026");
  expect(replacedDialog.querySelector(".mis-drill-total strong")).toHaveTextContent("Transactions unavailable");
  expect(replacedDialog.querySelector(".mis-drill-total span")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText(/matching · rows/)).not.toBeInTheDocument();
  expect(screen.queryByText("Matches the Actual in the report")).not.toBeInTheDocument();

  cleanup();
  mocks.runMisDrill.mockRejectedValueOnce(Object.assign(new Error("stale"), { status: 409 }));
  renderWithQuery(<StatementView response={response} />);
  openActual("Diesel", 0);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Statement out of date");
  expect(alert).toHaveTextContent("Generate the statement again");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("a forbidden drill and a failed drill each render alone with no rows counts or footer", async () => {
  for (const [error, expected] of [
    [Object.assign(new Error("forbidden"), { status: 403 }), "Ask an administrator if you need access"],
    [new Error("offline"), "Try opening this Actual again"],
  ] as const) {
    mocks.runMisDrill.mockRejectedValueOnce(error);
    renderWithQuery(<StatementView response={response} />);
    openActual("Diesel", 0);
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/matching · rows/)).not.toBeInTheDocument();
    expect(screen.queryByText("Matches the Actual in the report")).not.toBeInTheDocument();
    cleanup();
  }
});

test("drilling a leaf inside the aggregate panel replaces the body in place and back returns to the group with focus on the leaf row", async () => {
  mocks.runMisDrill.mockResolvedValue(drillResponse());
  renderWithQuery(<StatementView response={response} />);
  openActual("Admin Expenses", 0);
  const leafRow = within(screen.getByRole("dialog")).getByRole("row", { name: /Diesel/ });
  fireEvent.click(within(leafRow).getByRole("button"));

  expect(await screen.findByRole("dialog", { name: "Diesel" })).toHaveFocus();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Admin Expenses" }));
  const returnedLeaf = within(screen.getByRole("dialog")).getByRole("row", { name: /Diesel/ });
  await waitFor(() => expect(within(returnedLeaf).getByRole("button")).toHaveFocus());
});

test("the aggregate drill on a not loaded parent and on the grand total renders dashed budgets and a dashed footer and performs no paise arithmetic on the budget", () => {
  const notLoadedResponse = {
    ...response,
    tree: response.tree.map((statementNode) =>
      statementNode.nodeKey === "admin"
        ? notLoadedNode({
            ...statementNode,
            measures: [measure("selected", "60.06", "30.07"), statementNode.measures[1]],
          })
        : notLoadedNode(statementNode),
    ),
    grandTotal: notLoadedNode({
      ...response.grandTotal,
      measures: [measure("selected", "60.06", "32.08"), response.grandTotal.measures[1]],
    }),
  };
  renderWithQuery(<StatementView response={notLoadedResponse} />);
  openActual("Admin Expenses", 0);

  let dialog = screen.getByRole("dialog", { name: "Admin Expenses" });
  expect(within(dialog).getByRole("row", { name: /Diesel/ })).toHaveTextContent("–₹5");
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("–Total withheld–");
  expect(within(dialog).getAllByLabelText("Budget not loaded for this plant")).toHaveLength(8);
  expect(within(dialog).queryByText("₹30.06exact")).not.toBeInTheDocument();

  cleanup();
  renderWithQuery(<StatementView response={notLoadedResponse} />);
  fireEvent.click(within(screen.getByRole("row", { name: "Grand total" })).getAllByRole("button")[0]);
  dialog = screen.getByRole("dialog", { name: "Grand Total" });
  expect(within(dialog).getByRole("row", { name: /unmapped-GL/ })).toHaveTextContent("–₹2–");
  expect(within(dialog).getByRole("row", { name: "Total" })).toHaveTextContent("–Total withheld–");
  expect(within(dialog).queryByText("₹32.07exact")).not.toBeInTheDocument();
});

test("the leaf actual transactions path is unchanged for a not loaded block", async () => {
  mocks.runMisDrill.mockResolvedValue(drillResponse());
  const leaf = notLoadedNode(diesel);
  renderWithQuery(<StatementView response={{ ...response, tree: [leaf], grandTotal: leaf }} />);
  openActual("Diesel", 0);

  await waitFor(() => expect(mocks.runMisDrill).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("table")).toHaveTextContent("REF-1Diesel");
  expect(mocks.runMisDrill).toHaveBeenCalledWith(expect.objectContaining({ nodeKey: "diesel", block: "selected" }));
});

function drillResponse(overrides: Partial<MisDrillResponse> = {}): MisDrillResponse {
  return {
    nodeKey: "diesel",
    leafKey: "diesel",
    lines: [
      {
        month: "2026-07-01",
        postingDate: "2026-07-02",
        txnNo: "1900001234",
        costCenter: "DUB-NUR",
        accountName: "Sprout Cost - Imp",
        debit: "5.01",
        credit: "0.00",
        value: "5.01",
        reference: "REF-1",
        memo: "Diesel",
      },
    ],
    footer: { debit: "5.01", credit: "0.00", value: "5.01" },
    totalCount: 1,
    page: 1,
    pageSize: 100,
    actualBatchIds: ["actuals-july"],
    budgetBatchId: "budget-july",
    batchStatuses: [],
    ...overrides,
  };
}

function openActual(rowName: string, blockIndex: number) {
  fireEvent.click(within(screen.getByRole("row", { name: new RegExp(rowName) })).getAllByRole("button")[blockIndex]);
}

function StatementView({ response }: Readonly<{ response: MisStatementResolvedResponse }>) {
  const [drill, setDrill] = useState<DrillPanelSelection | null>(null);
  function openDrill(target: DrillPanelTarget, opener: HTMLButtonElement) {
    setDrill({ ...target, opener });
  }
  return (
    <>
      <OwnedStatementView response={response} onOpenDrill={openDrill} />
      {drill && <DrillPanel selection={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function node(
  nodeKey: string,
  sNo: string | null,
  budgetComponent: string,
  glCode: string | null,
  budget: FixedScaleMoney,
  actual: FixedScaleMoney,
  ytdBudget: FixedScaleMoney,
  ytdActual: FixedScaleMoney,
  children: MisStatementNode[] = [],
): MisStatementNode {
  return {
    nodeKey,
    sNo,
    budgetComponent,
    glCode,
    measures: [measure("selected", budget, actual), measure("fy26-27-ytd", ytdBudget, ytdActual)],
    children,
  };
}

function measure(
  key: MisStatementMeasureBlock["key"],
  budget: FixedScaleMoney,
  actual: FixedScaleMoney,
): MisStatementMeasureBlock {
  return {
    key,
    label: key === "selected" ? "raw selected label" : "raw ytd label",
    from: key === "selected" ? "2026-07-01" : "2026-04-01",
    to: "2026-07-01",
    budgetState: "loaded",
    budget,
    rollover: null,
    actual,
    percentage: budget === "0.00" ? (actual === "0.00" ? null : "over-budget") : "0.5",
    sourcePresence: ["matched"],
  };
}

function notLoadedNode(statementNode: MisStatementNode): MisStatementNode {
  return {
    ...statementNode,
    measures: statementNode.measures.map((measureBlock) => notLoaded(measureBlock)),
    children: statementNode.children.map(notLoadedNode),
  };
}

function notLoaded(measureBlock: MisStatementMeasureBlock): MisStatementMeasureBlock {
  // The all-plants backend task removes this cast when it makes the wire contract a discriminated union.
  return { ...measureBlock, budgetState: "not-loaded", budget: null } as unknown as MisStatementMeasureBlock;
}
