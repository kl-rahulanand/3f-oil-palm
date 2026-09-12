import type { AskResponse, AuthUser, Selection } from "@3f/contract";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import AskPage from "@/app/(app)/ask/page";
import { AppShell } from "@/src/components/shell/app-shell";
import { renderWithQuery } from "@/src/test/render";
import { AskPanel } from "./ask-panel";
import { AskProvider } from "./use-ask";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), saveQuery: vi.fn(), createPin: vi.fn(), replace: vi.fn() }));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ask",
  useRouter: () => ({ replace: mocks.replace }),
}));

const user: AuthUser = {
  id: "user",
  email: "admin@example.invalid",
  display_name: "R. Venkatesh",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [],
};

const selection: Selection = {
  domain: "mis-statement",
  measureIds: ["mis-statement.actual"],
  dimensionIds: ["mis-statement.leaf_key"],
  filters: [],
};

const success: AskResponse = {
  responseClass: "success" as AskResponse["responseClass"],
  sessionId: "session",
  title: "Governed result",
  selection,
  chartType: "bar",
  result: {
    columns: [
      { key: "measure", label: "Measure", numeric: false },
      { key: "actual", label: "Actual", numeric: true },
      { key: "budget", label: "Budget", numeric: true },
    ],
    rows: [
      { measure: "Nursery", actual: "125.50", budget: "200.00" },
      { measure: "Seedlings", actual: "75.25", budget: "80.00" },
    ],
  },
  provenance: {
    verified: true,
    measureIds: ["mis-statement.actual", "mis-statement.budget"],
    measures: [
      {
        id: "mis-statement.actual",
        label: "Actual",
        expr: "governed actual",
        grain: "leaf and month",
        impliedFilters: [],
      },
      {
        id: "mis-statement.budget",
        label: "Budget",
        expr: "governed budget",
        grain: "leaf and month",
        impliedFilters: [],
      },
    ],
    impliedFilters: [],
    scope: "Agriculture · Nursery · DUB",
    readback: "Actual and Budget for the governed nursery scope",
    dataAsOf: "July close",
    sql: "not rendered",
    activeBatchIds: [],
  },
  viewInReport: { available: false, reason: "This answer is not a statement selection." },
};

afterEach(() => {
  cleanup();
  mocks.ask.mockReset();
  mocks.saveQuery.mockReset();
  mocks.createPin.mockReset();
});

test("a successful answer renders its result with the verified badge the provenance disclosure and no number the response did not carry", async () => {
  mocks.ask.mockResolvedValue(success);
  renderAsk();

  submit("Show the governed result");

  const answer = (await screen.findByText("Governed result")).closest("article")!;
  expect(within(answer).getByText("✓ Verified")).toBeInTheDocument();
  expect(await within(answer).findByRole("img", { name: "bar chart" })).toBeInTheDocument();
  expect(within(answer).getByRole("table")).toHaveTextContent("Nursery");
  fireEvent.click(within(answer).getByText("How this was calculated"));
  expect(within(answer).getByText("Actual and Budget for the governed nursery scope")).toBeInTheDocument();
  expect(within(answer).getByText("Agriculture · Nursery · DUB")).toBeInTheDocument();
  expect(within(answer).getByText("July close")).toBeInTheDocument();
  expect(answer.textContent?.replace(/\D/g, "")).toBe("125502000075258000");

  cleanup();
  mocks.ask.mockResolvedValue({
    ...success,
    provenance: { ...success.provenance!, verified: false },
  });
  renderAsk();
  submit("Show an unverified governed result");
  await screen.findByText("Governed result");
  expect(screen.queryByText("✓ Verified")).not.toBeInTheDocument();
});

test("a chart shape the client cannot draw honestly falls back to the table rather than a misleading chart", async () => {
  mocks.ask.mockResolvedValue({
    ...success,
    chartType: "bar",
    result: {
      columns: [
        { key: "plant", label: "Plant", numeric: false },
        { key: "month", label: "Month", numeric: false },
        { key: "actual", label: "Actual", numeric: true },
      ],
      rows: [{ plant: "DUB", month: "July", actual: "125.50" }],
    },
  });
  renderAsk();

  submit("Show an unsupported chart shape");

  expect(await screen.findByRole("table")).toHaveTextContent("125.50");
  expect(screen.queryByRole("img", { name: "bar chart" })).not.toBeInTheDocument();
});

test("save and pin controls appear only on a successful answer and call their routes", async () => {
  mocks.ask.mockResolvedValueOnce(success);
  mocks.saveQuery.mockResolvedValue({});
  mocks.createPin.mockResolvedValue({});
  renderAsk();
  submit("Show the governed result");

  await screen.findByRole("heading", { name: "Governed result" });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
  await waitFor(() => expect(mocks.saveQuery).toHaveBeenCalledWith({ selection, chartType: "bar" }));
  fireEvent.click(screen.getByRole("button", { name: "Pin report" }));
  await waitFor(() =>
    expect(mocks.createPin).toHaveBeenCalledWith({ selection, title: "Governed result", chartType: "bar" }),
  );

  cleanup();
  mocks.ask.mockResolvedValueOnce({
    responseClass: "informational" as AskResponse["responseClass"],
    sessionId: "session",
    title: "Actual",
    definition: "The governed actual amount.",
    viewInReport: { available: false, reason: "Definitions do not open a report." },
  });
  renderAsk();
  submit("Define Actual");

  await screen.findByRole("heading", { name: "Actual" });
  expect(screen.queryByRole("button", { name: "Save view" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pin report" })).not.toBeInTheDocument();
});

test("failed save and pin controls show actionable copy without raw API errors", async () => {
  mocks.ask.mockResolvedValue(success);
  mocks.saveQuery.mockRejectedValue(new Error("API request failed with status 500"));
  renderAsk();
  submit("Show the governed result");

  await screen.findByRole("heading", { name: "Governed result" });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The view could not be saved. Try again.");
  expect(screen.queryByText("API request failed with status 500")).not.toBeInTheDocument();

  mocks.createPin.mockRejectedValue(new Error("API request failed with status 500"));
  fireEvent.click(screen.getByRole("button", { name: "Pin report" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The report could not be pinned. Try again.");
  expect(screen.queryByText("API request failed with status 500")).not.toBeInTheDocument();
});

test("suppressed values and signed pie data render only in the honest table fallback", async () => {
  mocks.ask.mockResolvedValueOnce({
    ...success,
    chartType: "kpi",
    result: {
      columns: [{ key: "actual", label: "Actual", numeric: true }],
      rows: [{ actual: "125.50" }],
      suppressedCells: [{ row: 0, key: "actual" }],
    },
  });
  renderAsk();
  submit("Show a suppressed result");

  const suppressedTable = await screen.findByRole("table");
  expect(within(suppressedTable).getByText("—")).toBeInTheDocument();
  expect(within(suppressedTable).queryByText("125.50")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Key results")).not.toBeInTheDocument();

  cleanup();
  mocks.ask.mockResolvedValueOnce({
    ...success,
    chartType: "pie",
    result: {
      columns: [
        { key: "measure", label: "Measure", numeric: false },
        { key: "actual", label: "Actual", numeric: true },
      ],
      rows: [
        { measure: "Debit", actual: "-25.00" },
        { measure: "Credit", actual: "75.00" },
      ],
    },
  });
  renderAsk();
  submit("Show signed financial values");

  expect(await screen.findByRole("table")).toHaveTextContent("-25.00");
  expect(screen.queryByRole("img", { name: "pie chart" })).not.toBeInTheDocument();
});

test("view in report renders the link when available and shows the reason when it is not", async () => {
  const activeBatchIds = [{ source: "actuals" as const, period: "July", batchId: "actuals-current" }];
  mocks.ask.mockResolvedValueOnce({
    ...success,
    viewInReport: {
      available: true,
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "July",
      activeBatchIds,
    },
  });
  renderAsk();
  submit("Open the statement");

  const link = await screen.findByRole("link", { name: "View in report" });
  const params = new URL(link.getAttribute("href")!, "http://localhost").searchParams;
  expect(Object.fromEntries(params.entries())).toEqual({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "July",
    activeBatchIds: JSON.stringify(activeBatchIds),
  });

  cleanup();
  mocks.ask.mockResolvedValueOnce(success);
  renderAsk();
  submit("Explain why no report is available");
  expect(await screen.findByText("This answer is not a statement selection.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "View in report" })).not.toBeInTheDocument();
});

test("an informational answer renders its definition and suggested questions rather than an empty message", async () => {
  mocks.ask.mockResolvedValue({
    responseClass: "informational" as AskResponse["responseClass"],
    sessionId: "session",
    title: "Actual",
    definition: "The governed amount posted from SAP.",
    suggestedQuestions: ["Show governed Actual for Agriculture Nursery DUB this month"],
    viewInReport: { available: false, reason: "Definitions do not open a report." },
  });
  renderAsk();

  submit("What is Actual?");

  expect(await screen.findByRole("heading", { name: "Actual" })).toBeInTheDocument();
  expect(screen.getByText("The governed amount posted from SAP.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Show governed Actual for Agriculture Nursery DUB this month" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Show percentage for Agriculture Nursery DUB this month" }),
  ).not.toBeInTheDocument();
});

test("each message bearing failure class renders its honest message alone with no result chart provenance or report link", async () => {
  const failures = ["blocked_by_policy", "not_supported", "execution_failed", "backend_error"] as const;
  renderAsk();

  for (const responseClass of failures) {
    const message = `Honest ${responseClass} message`;
    mocks.ask.mockResolvedValueOnce({
      responseClass: responseClass as AskResponse["responseClass"],
      sessionId: "session",
      message,
      viewInReport: { available: false, reason: "Not available." },
    });
    submit(`Trigger ${responseClass}`);
    const answer = await screen.findByText(message);
    expect(answer).toHaveClass("ask-failure");
    expect(answer).not.toHaveTextContent("Verified");
    expect(within(answer).queryByRole("table")).not.toBeInTheDocument();
    expect(within(answer).queryByText("How this was calculated")).not.toBeInTheDocument();
    expect(within(answer).queryByRole("link", { name: "View in report" })).not.toBeInTheDocument();
  }
});

test("a clarification renders its options selectably and does not read as an error", async () => {
  mocks.ask
    .mockResolvedValueOnce({
      responseClass: "clarification_needed" as AskResponse["responseClass"],
      sessionId: "session",
      clarify: { prompt: "Which governed measure do you mean?", options: ["Actual", "Budget"] },
      viewInReport: { available: false, reason: "Choose a measure first." },
    })
    .mockResolvedValueOnce({
      responseClass: "informational" as AskResponse["responseClass"],
      sessionId: "session",
      title: "Actual",
      definition: "The governed actual amount.",
      viewInReport: { available: false, reason: "Definitions do not open a report." },
    });
  renderAsk();
  submit("Show the measure");

  const prompt = await screen.findByText("Which governed measure do you mean?");
  expect(prompt.closest("article")).toHaveClass("ask-clarification");
  expect(prompt.closest("[role=alert]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Actual" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenLastCalledWith({ question: "Actual" }));
});

test("only successful turns become prior turns and the thread survives opening the ask page but not a reload", async () => {
  mocks.ask
    .mockResolvedValueOnce(success)
    .mockResolvedValueOnce({
      responseClass: "not_supported" as AskResponse["responseClass"],
      sessionId: "session",
      message: "That question is not supported.",
      viewInReport: { available: false, reason: "Not available." },
    })
    .mockResolvedValueOnce({
      responseClass: "informational" as AskResponse["responseClass"],
      sessionId: "session",
      title: "Budget",
      definition: "The governed budget amount.",
      viewInReport: { available: false, reason: "Definitions do not open a report." },
    });
  const mounted = render(
    <AskProvider>
      <RouteHarness />
    </AskProvider>,
  );

  submit("Show governed Actual");
  await screen.findByText("Governed result");
  submit("Predict next season");
  await screen.findByText("That question is not supported.");
  fireEvent.change(screen.getByLabelText("Ask about your MIS data"), { target: { value: "Unsaved draft" } });
  fireEvent.click(screen.getByRole("link", { name: "Open in Ask" }));
  expect(screen.getByRole("region", { name: "Ask" })).toHaveAttribute("data-surface", "page");
  expect(screen.getByText("Show governed Actual")).toBeInTheDocument();
  expect(screen.getByLabelText("Ask about your MIS data")).toHaveValue("");
  submit("Define Budget");

  await waitFor(() =>
    expect(mocks.ask).toHaveBeenLastCalledWith({
      question: "Define Budget",
      priorTurns: [{ question: "Show governed Actual", selection }],
    }),
  );

  mounted.unmount();
  renderAsk();
  expect(screen.queryByText("Show governed Actual")).not.toBeInTheDocument();
});

test("the docked panel and the standalone ask page render from the same component and ask is a live shell destination", () => {
  render(
    <AskProvider>
      <AskPage />
    </AskProvider>,
  );
  expect(screen.getByRole("region", { name: "Ask" })).toHaveAttribute("data-surface", "page");

  cleanup();
  render(
    <AskProvider>
      <AskPanel surface="docked" />
    </AskProvider>,
  );
  expect(screen.getByRole("region", { name: "Ask panel" })).toHaveAttribute("data-surface", "docked");

  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  renderWithQuery(
    <AppShell user={user}>
      <div>Canvas</div>
    </AppShell>,
  );
  expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
});

function renderAsk() {
  return render(
    <AskProvider>
      <AskPanel surface="page" />
    </AskProvider>,
  );
}

function submit(question: string) {
  fireEvent.change(screen.getByLabelText("Ask about your MIS data"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
}

function RouteHarness() {
  const [pathname, setPathname] = useState("/mis-reports");
  return (
    <div
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest('a[href="/ask"]')) {
          event.preventDefault();
          setPathname("/ask");
        }
      }}
    >
      {pathname === "/ask" ? <AskPage /> : <AskPanel surface="docked" />}
    </div>
  );
}
