import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
} from "@3f/contract";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithQuery } from "@/src/test/render";
import { StatementView } from "./statement-view";

const mocks = vi.hoisted(() => ({
  misOptions: vi.fn(),
  runMisStatement: vi.fn(),
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
  provenance: { activeBatchIds: [] },
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
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();

  fireEvent.click(opener);
  fireEvent.click(screen.getByTestId("drill-scrim"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

function openActual(rowName: string, blockIndex: number) {
  fireEvent.click(within(screen.getByRole("row", { name: new RegExp(rowName) })).getAllByRole("button")[blockIndex]);
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
    budget,
    rollover: null,
    actual,
    percentage: budget === "0.00" ? (actual === "0.00" ? null : "over-budget") : "0.5",
    sourcePresence: ["matched"],
  };
}
