import type { MisStatementResolvedResponse } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithQuery } from "@/src/test/render";
import { AskProvider } from "../assistant/use-ask";
import { MisReportView } from "./mis-report-view";

const mocks = vi.hoisted(() => ({
  misOptions: vi.fn(),
  runMisStatement: vi.fn(),
  runMisDrill: vi.fn(),
  ask: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));

const options = {
  departments: ["Agriculture"],
  functions: ["Nursery"],
  plants: [
    {
      value: "DUB",
      label: "Agri - Nursery - DUB",
      aliases: ["DUB-NUR"],
      department: "Agriculture",
      function: "Nursery",
    },
  ],
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
          budgetState: "loaded",
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
        budgetState: "loaded",
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

const groundedStatement: MisStatementResolvedResponse = {
  ...statement,
  attestedContext: "claims.signature",
  nodeMetadata: [{ nodeKey: "shade", glCodes: ["5001"], costCentres: ["Primary"] }],
  nodeAmounts: [{ nodeKey: "shade", block: "selected", actualPaise: "5000" }],
};

afterEach(() => {
  cleanup();
  mocks.misOptions.mockReset();
  mocks.runMisStatement.mockReset();
  mocks.runMisDrill.mockReset();
  mocks.ask.mockReset();
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

test("the block comes from the focused node and there is no selected block before focus", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue(groundedStatement);
  mocks.ask
    .mockResolvedValueOnce(groundedResponse({ outcome: "focus-required" }))
    .mockResolvedValueOnce(groundedResponse({ outcome: "focus-required" }));
  renderGroundedReport();
  await generateStatement();
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));

  submitDock("How is this built?");
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
  expect(mocks.ask.mock.calls[0]?.[0].statementGrounding).not.toHaveProperty("focus");

  clickShadeActual();
  submitDock("How is this built?");
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0].statementGrounding.focus).toEqual({
    nodeKey: "shade",
    block: "selected",
    subject: "actual",
  });
});

test("with no rendered statement the dock says so locally and submits no grounded ask", async () => {
  mocks.misOptions.mockResolvedValue(options);
  renderGroundedReport();

  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));

  expect(screen.getByRole("status")).toHaveTextContent("Generate a mapped statement first");
  expect(
    within(screen.getByRole("region", { name: "Ask panel" })).getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
  expect(mocks.ask).not.toHaveBeenCalled();
});

test("a statement response missing the attested context does not offer a grounded ask", async () => {
  await expectUngroundedField({ ...groundedStatement, attestedContext: undefined });
});

test("a statement response missing node metadata does not offer a grounded ask", async () => {
  await expectUngroundedField({ ...groundedStatement, nodeMetadata: undefined });
});

test("a statement response missing node amounts does not offer a grounded ask", async () => {
  await expectUngroundedField({ ...groundedStatement, nodeAmounts: undefined });
});

test("focus clears when the statement scope or pinned batches change", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValueOnce(groundedStatement).mockResolvedValueOnce({
    ...groundedStatement,
    provenance: {
      activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: "replacement" }],
    },
  });
  mocks.ask.mockResolvedValue(groundedResponse({ outcome: "focus-required" }));
  renderGroundedReport();
  await generateStatement();
  clickShadeActual();
  fireEvent.click(screen.getByRole("button", { name: "Close drill-down" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(mocks.runMisStatement).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
  submitDock("How is this built?");
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledOnce());

  expect(mocks.ask.mock.calls[0]?.[0].statementGrounding).not.toHaveProperty("focus");
});

test("the dock says so locally when the scope has no mapping and submits no grounded ask", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue({
    outcome: "unresolvable",
    notice: "No mapping configured",
    tree: [],
    grandTotal: null,
    provenance: { activeBatchIds: [] },
  });
  renderGroundedReport();
  await screen.findByLabelText("Period");
  chooseSelection();
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await screen.findByText("No mapping configured");
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));

  expect(screen.getByText(/Generate a mapped statement first/)).toBeInTheDocument();
  expect(mocks.ask).not.toHaveBeenCalled();
});

test("the explanation control opens the same drill the statement click opens", async () => {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue(groundedStatement);
  mocks.runMisDrill.mockReturnValue(new Promise(() => undefined));
  mocks.ask.mockResolvedValue(
    groundedResponse({
      outcome: "leaf",
      nodeKey: "shade",
      leafKey: "shade",
      block: "selected",
      budgetState: "loaded",
      rollup: [],
      transactions: {
        lines: [],
        footer: { debit: "50.00", credit: "0.00", value: "50.00" },
        totalCount: 0,
        pageSize: 20,
      },
    }),
  );
  renderGroundedReport();
  await generateStatement();
  clickShadeActual();
  expect(screen.getByRole("dialog", { name: "Shade Net" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close drill-down" }));
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
  submitDock("How is this built?");
  fireEvent.click(await screen.findByRole("button", { name: "Open full drill" }));

  expect(screen.getByRole("dialog", { name: "Shade Net" })).toBeInTheDocument();
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
      {
        value: "H.O",
        label: "Corporate - Office - Head Office",
        aliases: [],
        provisional: true,
        department: "Corporate",
        function: "Office",
      },
    ],
  });
  renderWithQuery(<MisReportView />);

  const plant = await screen.findByLabelText("Plant");
  expect(within(plant).getByRole("option", { name: "Agri - Nursery - DUB" })).toBeInTheDocument();
  expect(
    within(plant).getByRole("option", { name: "Corporate - Office - Head Office — Provisional labels" }),
  ).toHaveValue("H.O");
});

test("choosing a plant first fills its department and function", async () => {
  mocks.misOptions.mockResolvedValue(tupleOptions());
  renderWithQuery(<MisReportView />);

  fireEvent.change(await screen.findByLabelText("Plant"), { target: { value: "H.O" } });

  expect(screen.getByLabelText("Department")).toHaveValue("Corporate");
  expect(screen.getByLabelText("Function")).toHaveValue("Office");
});

test("choosing a department first filters its functions and plants", async () => {
  mocks.misOptions.mockResolvedValue({ ...tupleOptions(), functions: ["Nursery", "Flat-list-only"] });
  renderWithQuery(<MisReportView />);

  const department = await screen.findByLabelText("Department");
  fireEvent.change(department, { target: { value: "Agriculture" } });

  expect(within(screen.getByLabelText("Function")).getByRole("option", { name: "Nursery" })).toBeInTheDocument();
  expect(within(screen.getByLabelText("Function")).queryByRole("option", { name: "Office" })).not.toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Function")).queryByRole("option", { name: "Flat-list-only" }),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Plant")).getByRole("option", { name: "Agri - Nursery - DUB" }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Plant")).queryByRole("option", { name: "Corporate - Office - Head Office" }),
  ).not.toBeInTheDocument();
});

test("changing a department or function clears a plant that no longer matches", async () => {
  mocks.misOptions.mockResolvedValue(tupleOptions());
  renderWithQuery(<MisReportView />);

  const plant = await screen.findByLabelText("Plant");
  fireEvent.change(plant, { target: { value: "DUB" } });
  fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Field" } });
  expect(screen.getByLabelText("Plant")).toHaveValue("");

  fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Nursery" } });
  fireEvent.change(screen.getByLabelText("Plant"), { target: { value: "DUB" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Corporate" } });
  expect(screen.getByLabelText("Function")).toHaveValue("");
  expect(screen.getByLabelText("Plant")).toHaveValue("");
});

test("metadata-free plants stay selectable without contributing flat selector values", async () => {
  mocks.misOptions.mockResolvedValue({
    ...options,
    departments: ["Flat-list-only"],
    functions: ["Flat-list-only"],
    plants: [
      { value: "DUB", label: "DUB", aliases: [] },
      { value: "VJA", label: "Agri - Nursery - VJA", aliases: [], department: "Agriculture", function: "Nursery" },
    ],
  });
  renderWithQuery(<MisReportView />);

  const plant = await screen.findByLabelText("Plant");
  expect(within(plant).getByRole("option", { name: "DUB" })).toBeInTheDocument();
  expect(within(screen.getByLabelText("Department")).getByRole("option", { name: "Agriculture" })).toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Department")).queryByRole("option", { name: "Flat-list-only" }),
  ).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("Function")).getByRole("option", { name: "Nursery" })).toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Function")).queryByRole("option", { name: "Flat-list-only" }),
  ).not.toBeInTheDocument();

  fireEvent.change(plant, { target: { value: "VJA" } });
  expect(screen.getByLabelText("Department")).toHaveValue("Agriculture");
  expect(screen.getByLabelText("Function")).toHaveValue("Nursery");
  fireEvent.change(plant, { target: { value: "DUB" } });
  expect(screen.getByLabelText("Department")).toHaveValue("");
  expect(screen.getByLabelText("Function")).toHaveValue("");
});

test("metadata-free plants do not preserve a function across an incompatible department", async () => {
  mocks.misOptions.mockResolvedValue({
    ...options,
    plants: [
      { value: "DUB", label: "DUB", aliases: [] },
      { value: "VJA", label: "Agri - Nursery - VJA", aliases: [], department: "Agriculture", function: "Nursery" },
      {
        value: "H.O",
        label: "Corporate - Office - Head Office",
        aliases: [],
        department: "Corporate",
        function: "Office",
      },
    ],
  });
  renderWithQuery(<MisReportView />);

  const plant = await screen.findByLabelText("Plant");
  fireEvent.change(plant, { target: { value: "VJA" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Corporate" } });

  expect(screen.getByLabelText("Function")).toHaveValue("");
  expect(
    within(screen.getByLabelText("Plant")).getByRole("option", { name: "Corporate - Office - Head Office" }),
  ).toBeInTheDocument();
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

function tupleOptions() {
  return {
    ...options,
    plants: [
      ...options.plants,
      { value: "VJA", label: "Agri - Field - VJA", aliases: [], department: "Agriculture", function: "Field" },
      {
        value: "H.O",
        label: "Corporate - Office - Head Office",
        aliases: [],
        department: "Corporate",
        function: "Office",
      },
    ],
  };
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

function renderGroundedReport() {
  return renderWithQuery(
    <AskProvider pathname="/mis-reports">
      <MisReportView />
    </AskProvider>,
  );
}

async function generateStatement() {
  await screen.findByLabelText("Period");
  chooseSelection();
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await screen.findByRole("treegrid", { name: "Financial MIS statement" });
}

function submitDock(question: string) {
  const dock = screen.getByRole("region", { name: "Ask panel" });
  fireEvent.change(within(dock).getByLabelText("Ask about your MIS data"), { target: { value: question } });
  fireEvent.click(within(dock).getByRole("button", { name: "Send question" }));
}

function clickShadeActual() {
  fireEvent.click(
    within(screen.getByRole("row", { name: /Shade Net/ })).getByRole("button", { name: /Drill down Actual/ }),
  );
}

function groundedResponse(statementGrounding: NonNullable<import("@3f/contract").AskResponse["statementGrounding"]>) {
  return {
    responseClass: "success",
    sessionId: "session",
    statementGrounding,
    viewInReport: { available: false, reason: "Statement explanation." },
  };
}

async function expectUngroundedField(response: MisStatementResolvedResponse) {
  mocks.misOptions.mockResolvedValue(options);
  mocks.runMisStatement.mockResolvedValue(response);
  renderGroundedReport();
  await generateStatement();
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
  expect(screen.getByRole("status")).toHaveTextContent("Generate a mapped statement first");
  expect(mocks.ask).not.toHaveBeenCalled();
  cleanup();
}
