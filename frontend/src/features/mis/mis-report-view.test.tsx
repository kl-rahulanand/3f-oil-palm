import type { MisSelectionResolvedResponse, MisSelectionRunResponse } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithQuery } from "@/src/test/render";
import { MisReportView } from "./mis-report-view";

const mocks = vi.hoisted(() => ({ misOptions: vi.fn(), runMisSelection: vi.fn() }));

vi.mock("@/src/lib/api", () => ({ api: mocks }));

const options = {
  departments: ["Agriculture"],
  functions: ["Nursery"],
  plants: [{ value: "DUB", label: "Agri - Nursery - DUB", aliases: ["DUB-NUR"] }],
  periods: [
    { value: "2026-06-01", label: "Jun 2026", from: "2026-06-01", to: "2026-06-01" },
    { value: "2026-07-01", label: "Jul 2026", from: "2026-07-01", to: "2026-07-01" },
    { value: "fy26-27-ytd", label: "FY 26-27 YTD", from: "2026-04-01", to: "2026-07-01" },
  ],
};

const zeroResolved: MisSelectionResolvedResponse = {
  outcome: "resolved",
  scope: {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    costCentres: ["Primary", "Admin"],
    glCodes: ["50001701", "55010302"],
    misFormat: "nursery-mis-financial-v1",
  },
  result: {
    columns: [
      { key: "gl_code", label: "GL code", numeric: false },
      { key: "actual", label: "Actual", numeric: true },
    ],
    rows: [],
  },
  totals: { actual: 0, budget: 0, percentage: null },
  bucketRows: [],
};

afterEach(() => {
  cleanup();
  mocks.misOptions.mockReset();
  mocks.runMisSelection.mockReset();
});

test("the MIS reports page presents department function plant and period as native selects populated from the options route offering only the loaded actual months plus the financial year to date option, and Generate posts exactly the four selectors to the run route", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisSelection.mockResolvedValue(zeroResolved);
  renderWithQuery(<MisReportView />);

  const department = await screen.findByLabelText("Department");
  const functionSelect = screen.getByLabelText("Function");
  const plant = screen.getByLabelText("Plant");
  const period = screen.getByLabelText("Period");
  expect([department, functionSelect, plant, period].every((control) => control.tagName === "SELECT")).toBe(true);
  expect(
    within(period)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Select period", "Jun 2026", "Jul 2026", "FY 26-27 YTD"]);
  expect(within(plant).getByRole("option", { name: "Agri - Nursery - DUB" })).toHaveValue("DUB");
  expect(screen.getByText("Select Department, Function and Plant, then Generate")).toBeInTheDocument();
  expect(screen.getByText(/Nothing is written back/)).toBeInTheDocument();

  chooseSelection("fy26-27-ytd");
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));

  await waitFor(() =>
    expect(mocks.runMisSelection).toHaveBeenCalledWith({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "fy26-27-ytd",
    }),
  );
  expect(Object.keys(mocks.runMisSelection.mock.calls[0][0])).toEqual(["department", "function", "plant", "period"]);
});

test("a resolved selection renders the scope readout naming the cost centres GL codes and MIS format and shows a configured zero result without the notice when there are no transactions, while an unresolvable selection renders zeros with the no mapping configured notice", async () => {
  await generate(zeroResolved);
  const scope = screen.getByRole("heading", { name: "Resolved scope" }).closest("section");
  expect(scope).toHaveTextContent("Primary, Admin");
  expect(scope).toHaveTextContent("50001701, 55010302");
  expect(scope).toHaveTextContent("nursery-mis-financial-v1");
  expect(screen.getByText("Mapping configured. No transactions were found for this period.")).toBeInTheDocument();
  expect(screen.queryByText("No mapping configured")).not.toBeInTheDocument();
  expect(screen.getAllByText("₹0.00")).toHaveLength(2);

  cleanup();
  await generate({
    outcome: "unresolvable",
    notice: "No mapping configured",
    result: zeroResolved.result,
    totals: { actual: 0, budget: 0, percentage: null },
    bucketRows: [],
  });
  expect(screen.getByText("No mapping configured")).toBeInTheDocument();
  expect(screen.getAllByText("₹0.00")).toHaveLength(2);
  expect(screen.queryByText("Mapping configured. No transactions were found for this period.")).not.toBeInTheDocument();
});

test("the unmapped GL bucket is rendered as a reviewable list of its triples with amounts so the mapping gap is visible rather than absorbed into a total", async () => {
  await generate({
    ...zeroResolved,
    bucketRows: [
      {
        plant: "DUB",
        costCentre: "Primary",
        glCode: "50001701",
        misLine: "unmapped-GL",
        provisional: true,
        reason: "GL absent from Sheet1",
        actual: 125,
        budget: 200,
      },
      {
        plant: "DUB",
        costCentre: null,
        glCode: "99999999",
        misLine: "unmapped-GL",
        provisional: true,
        reason: "GL absent from Mapping Master",
        actual: 0,
        budget: 50,
      },
    ],
  });

  const list = screen.getByRole("heading", { name: "Unmapped GL review" }).parentElement?.nextElementSibling;
  expect(list).toBeTruthy();
  const rows = within(list as HTMLElement).getAllByRole("listitem");
  expect(within(rows[0]).getByText("DUB")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Primary")).toBeInTheDocument();
  expect(within(rows[0]).getByText("50001701")).toBeInTheDocument();
  expect(rows[0]).toHaveTextContent("Actual ₹125.00");
  expect(rows[0]).toHaveTextContent("Budget ₹200.00");
  expect(within(rows[1]).getByText("DUB")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Budget only")).toBeInTheDocument();
  expect(within(rows[1]).getByText("99999999")).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent("Actual ₹0.00");
  expect(rows[1]).toHaveTextContent("Budget ₹50.00");
});

test("a resolved selection actually renders the governed numbers so the returned result rows and the totals appear on the page rather than the page passing while showing nothing", async () => {
  await generate({
    ...zeroResolved,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "month", label: "Month", numeric: false },
        { key: "actual", label: "Actual", numeric: true },
        { key: "budget", label: "Budget", numeric: true },
        { key: "percentage", label: "%", numeric: true, format: "percent" },
      ],
      rows: [
        { gl_code: "50001701", month: "2026-07-01", actual: 125, budget: 200, percentage: 0.625 },
        { gl_code: "50001702", month: "2026-07-01", actual: 10, budget: 0, percentage: "over-budget" },
      ],
    },
    totals: { actual: 125, budget: 200, percentage: 0.625 },
  });

  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("50001701");
  expect(table).toHaveTextContent("Jul 2026");
  expect(table).toHaveTextContent("125");
  expect(table).toHaveTextContent("200");
  expect(table).toHaveTextContent("62.5%");
  expect(table).toHaveTextContent("over-budget");
  expect(screen.getByLabelText("Report totals")).toHaveTextContent("₹125.00");
  expect(screen.getByLabelText("Report totals")).toHaveTextContent("₹200.00");
});

async function generate(response: MisSelectionRunResponse) {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisSelection.mockResolvedValue(response);
  renderWithQuery(<MisReportView />);
  await screen.findByRole("option", { name: "Agriculture" });
  chooseSelection("2026-07-01");
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(mocks.runMisSelection).toHaveBeenCalled());
  await screen.findByLabelText("Report totals");
}

function chooseSelection(period: string) {
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Agriculture" } });
  fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Nursery" } });
  fireEvent.change(screen.getByLabelText("Plant"), { target: { value: "DUB" } });
  fireEvent.change(screen.getByLabelText("Period"), { target: { value: period } });
}
