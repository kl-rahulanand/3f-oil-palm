import type { MisStatementResolvedResponse } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithQuery } from "@/src/test/render";
import { MisReportView } from "./mis-report-view";

const mocks = vi.hoisted(() => ({
  misOptions: vi.fn(),
  runMisStatement: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));

const options = {
  departments: ["Agriculture"],
  functions: ["Nursery"],
  plants: [{ value: "DUB", label: "Agri - Nursery - DUB", aliases: ["DUB-NUR"] }],
  periods: [{ value: "2026-07-01", label: "Jul 2026", from: "2026-07-01", to: "2026-07-01" }],
};

const statement: MisStatementResolvedResponse = {
  outcome: "resolved",
  scope: {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    costCentres: ["Primary"],
    glCodes: ["5001"],
    misFormat: "nursery-mis-financial-v1",
  },
  tree: [
    {
      nodeKey: "shade",
      sNo: "4.1",
      budgetComponent: "Shade Net",
      glCode: "5001",
      measures: [
        {
          key: "selected",
          label: "2026-07-01",
          from: "2026-07-01",
          to: "2026-07-01",
          budget: "100.00",
          rollover: null,
          actual: "50.00",
          percentage: "0.5",
          sourcePresence: ["matched"],
        },
      ],
      children: [],
    },
  ],
  grandTotal: {
    nodeKey: "grand-total",
    sNo: null,
    budgetComponent: "Grand Total",
    glCode: null,
    measures: [
      {
        key: "selected",
        label: "2026-07-01",
        from: "2026-07-01",
        to: "2026-07-01",
        budget: "100.00",
        rollover: null,
        actual: "50.00",
        percentage: "0.5",
        sourcePresence: ["matched"],
      },
    ],
    children: [],
  },
  provenance: { activeBatchIds: [] },
};

afterEach(() => {
  cleanup();
  mocks.misOptions.mockReset();
  mocks.runMisStatement.mockReset();
  mocks.searchParams = new URLSearchParams();
});

test("Generate posts the existing four selectors to the statement route and renders the statement inline below them", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue(statement);
  renderWithQuery(<MisReportView />);

  const period = await screen.findByLabelText("Period");
  expect(within(period).getByRole("option", { name: "Jul 2026" })).toHaveValue("2026-07-01");
  chooseSelection();
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));

  await waitFor(() =>
    expect(mocks.runMisStatement).toHaveBeenCalledWith({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
    }),
  );
  const form = screen.getByRole("button", { name: "Generate" }).closest("form");
  const table = await screen.findByRole("treegrid", { name: "Financial MIS statement" });
  expect(form?.compareDocumentPosition(table)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(table).toHaveTextContent("Shade Net");
});

test("a failed statement call surfaces one clear report error and no stale statement", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockRejectedValue(new Error("failed"));
  renderWithQuery(<MisReportView />);

  await screen.findByLabelText("Period");
  chooseSelection();
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The report could not be generated. Check the selection and try again.",
  );
  expect(screen.queryByText("Select Department, Function and Plant, then Generate")).not.toBeInTheDocument();
  expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
});

test("a refresh required statement response replaces the report with its notice instead of rendering an empty statement", async () => {
  const activeBatchIds = [{ source: "actuals", period: "2026-07-01", batchId: "actuals-july" }];
  mocks.searchParams = new URLSearchParams({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    activeBatchIds: JSON.stringify(activeBatchIds),
  });
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue({
    outcome: "refresh-required",
    notice: "The data was refreshed - ask again",
  });

  renderWithQuery(<MisReportView />);

  expect(await screen.findByRole("alert")).toHaveTextContent("The data was refreshed - ask again");
  expect(screen.queryByRole("treegrid", { name: "Financial MIS statement" })).not.toBeInTheDocument();
  expect(screen.queryByText("Select Department, Function and Plant, then Generate")).not.toBeInTheDocument();
  expect(mocks.runMisStatement).toHaveBeenCalledWith({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    pinnedBatches: activeBatchIds,
  });
});

test("each in-page report link runs with its own pins while edited selections run without link-only pins", async () => {
  const firstPins = [{ source: "actuals" as const, period: "2026-07-01", batchId: "actuals-first" }];
  const secondPins = [{ source: "actuals" as const, period: "2026-07-01", batchId: "actuals-second" }];
  mocks.searchParams = reportParams(firstPins);
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue(statement);

  renderWithQuery(<NavigationHarness />);

  await waitFor(() =>
    expect(mocks.runMisStatement).toHaveBeenCalledWith({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
      pinnedBatches: firstPins,
    }),
  );
  fireEvent.change(await screen.findByLabelText("Department"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Agriculture" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await waitFor(() =>
    expect(mocks.runMisStatement).toHaveBeenLastCalledWith({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
    }),
  );

  mocks.searchParams = reportParams(secondPins);
  fireEvent.click(screen.getByRole("button", { name: "Navigate report link" }));
  await waitFor(() =>
    expect(mocks.runMisStatement).toHaveBeenLastCalledWith({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
      pinnedBatches: secondPins,
    }),
  );
});

test("a malformed pinned-batch report link is refused instead of running an unpinned statement", async () => {
  mocks.searchParams = reportParams("not-json");
  mocks.misOptions.mockResolvedValue(options);
  renderWithQuery(<MisReportView />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The report link is invalid. Return to Ask and open it again.",
  );
  expect(mocks.runMisStatement).not.toHaveBeenCalled();
  expect(screen.queryByText("Select Department, Function and Plant, then Generate")).not.toBeInTheDocument();
});

test("a plant option carrying provisional renders the plain text provisional labels suffix", async () => {
  mocks.misOptions.mockResolvedValue({
    ...options,
    plants: [
      ...options.plants,
      { value: "H.O", label: "Corporate - Office - Head Office", aliases: [], provisional: true },
    ],
  });
  renderWithQuery(<MisReportView />);

  const plant = await screen.findByLabelText("Plant");
  expect(within(plant).getByRole("option", { name: "Agri - Nursery - DUB" })).toBeInTheDocument();
  expect(
    within(plant).getByRole("option", { name: "Corporate - Office - Head Office — Provisional labels" }),
  ).toHaveValue("H.O");
});

function chooseSelection() {
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Agriculture" } });
  fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Nursery" } });
  fireEvent.change(screen.getByLabelText("Plant"), { target: { value: "DUB" } });
  fireEvent.change(screen.getByLabelText("Period"), { target: { value: "2026-07-01" } });
}

function reportParams(activeBatchIds: unknown): URLSearchParams {
  return new URLSearchParams({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    activeBatchIds: typeof activeBatchIds === "string" ? activeBatchIds : JSON.stringify(activeBatchIds),
  });
}

function NavigationHarness() {
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  return (
    <>
      <button type="button" onClick={rerender}>
        Navigate report link
      </button>
      <MisReportView />
    </>
  );
}
