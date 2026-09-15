// How the period-control leaves in this file are proven, and why it is not obvious.
//
// A vitest leaf is NOT proven by its testcase NAME appearing in the junit report. Vitest lists
// EVERY test in the file under its real name and marks the ones its `-t` filter missed as
// <skipped/>, so a filter matching nothing still produces a report full of matching names. A
// control run confirmed it. The discriminator is: present AND NOT <skipped/> AND NOT <failure/>.
// (This differs from tools/junit-run.mjs, where a non-matching --name yields ONE testcase named
// after the FILE PATH - a checker written for one runner is wrong for the other.)
//
// Two leaves here are deliberately ADVERSARIAL rather than merely positive:
//   - the "no period select" leaf builds informational, clarification and failure fixtures that
//     DELIBERATELY CARRY a periodControl, because AskResponse is a flat optional interface and a
//     renderer that ignores responseClass passes any fixture that simply omits the field;
//   - the picking leaf asserts the on-screen continuation behaviour, not just the eventual API
//     request, because a request assertion alone cannot tell continueTurn from a direct api.ask.
//
// UI work on this file and ask-panel.tsx was done with emil-design-eng and frontend-design, which
// are mandatory for a user_facing task; the period switcher is a quiet labelled native select
// chosen for its real selected state and keyboard behaviour at both panel widths.

import type { AskResponse, AuthUser, Selection } from "@3f/contract";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import AskPage from "@/app/(app)/ask/page";
import { AppShell } from "@/src/components/shell/app-shell";
import { renderWithQuery } from "@/src/test/render";
import { AskPanel } from "./ask-panel";
import { AskProvider, useAsk } from "./use-ask";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  saveQuery: vi.fn(),
  createPin: vi.fn(),
  warehouseFreshness: vi.fn().mockResolvedValue({ status: "unsupported", freshnessKind: "load" }),
  replace: vi.fn(),
  pathname: "/ask",
}));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
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

const periodChoice = {
  prompt: "Which statement period should this answer use?",
  question: "  Show the MIS statement Actual by statement leaf  ",
  selection,
  options: [
    {
      value: "2026-07-01",
      label: "July 2026",
      timeWindow: {
        grain: "month" as const,
        column: "month",
        from: "2026-07-01",
        to: "2026-07-01",
      },
    },
    {
      value: "2026-08-01",
      label: "August 2026",
      timeWindow: {
        grain: "month" as const,
        column: "month",
        from: "2026-08-01",
        to: "2026-08-01",
      },
    },
  ],
};

const periodClarification: AskResponse = {
  responseClass: "clarification_needed" as AskResponse["responseClass"],
  sessionId: "session",
  periodChoice,
  viewInReport: { available: false, reason: "Choose a period first." },
};

const periodControl = {
  current: "2026-07-01",
  coverage: "July 2026",
  options: periodChoice.options,
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
  mocks.pathname = "/ask";
  vi.useRealTimers();
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
  await waitFor(() => expect(mocks.ask).toHaveBeenLastCalledWith({ question: "Actual" }, expect.any(Object)));
});

test("a period choice renders its prompt and one button per offered period", async () => {
  mocks.ask.mockResolvedValue(periodClarification);
  renderAsk();

  submit("Show the statement");

  const prompt = await screen.findByText(periodChoice.prompt);
  const answer = prompt.closest("article")!;
  expect(within(answer).getAllByRole("button")).toHaveLength(2);
  expect(within(answer).getByRole("button", { name: "July 2026" })).toBeInTheDocument();
  expect(within(answer).getByRole("button", { name: "August 2026" })).toBeInTheDocument();
});

test("a successful statement answer renders its period select with the period it ran on selected", async () => {
  mocks.ask.mockResolvedValue({ ...success, periodControl });
  renderAsk();

  submit("Show the statement for July");

  expect(await screen.findByRole("combobox", { name: "Period" })).toHaveValue("2026-07-01");
});

test("a successful governed answer with a window renders its period select", async () => {
  mocks.ask.mockResolvedValue({
    ...success,
    selection: { ...selection, domain: "governed-financial" },
    periodControl,
  });
  renderAsk();

  submit("Show Actual and Budget by GL code for July");

  expect(await screen.findByRole("combobox", { name: "Period" })).toHaveValue("2026-07-01");
});

test("a successful answer with no window shows its coverage and no period select", async () => {
  mocks.ask.mockResolvedValue({
    ...success,
    periodControl: { ...periodControl, current: null, coverage: "All loaded months" },
  });
  renderAsk();

  submit("Show Actual and Budget by GL code");

  expect(await screen.findByText("All loaded months")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Period" })).not.toBeInTheDocument();
});

test("a non success response carrying a period control still renders no period select", async () => {
  const responses: AskResponse[] = [
    {
      responseClass: "informational" as AskResponse["responseClass"],
      sessionId: "session",
      definition: "A definition.",
      periodControl,
      viewInReport: { available: false, reason: "Not available." },
    },
    { ...periodClarification, periodControl },
    ...(["blocked_by_policy", "not_supported", "execution_failed", "backend_error"] as const).map(
      (responseClass): AskResponse => ({
        responseClass: responseClass as AskResponse["responseClass"],
        sessionId: "session",
        message: responseClass,
        periodControl,
        viewInReport: { available: false, reason: "Not available." },
      }),
    ),
  ];
  renderAsk();

  for (const [index, response] of responses.entries()) {
    mocks.ask.mockResolvedValueOnce(response);
    submit(`Non-success ${index}`);
    await screen.findByText(response.definition ?? response.message ?? periodChoice.prompt);
    expect(screen.queryByRole("combobox", { name: "Period" })).not.toBeInTheDocument();
  }
});

test("picking another period calls continue turn with the cloned selection and the unchanged question", async () => {
  let rejectSwitch!: (error: Error) => void;
  mocks.ask
    .mockResolvedValueOnce({ ...success, periodControl })
    .mockImplementationOnce(() => new Promise<AskResponse>((_resolve, reject) => (rejectSwitch = reject)));
  renderAsk();
  submit("Show the statement for July 2026");

  fireEvent.change(await screen.findByRole("combobox", { name: "Period" }), { target: { value: "2026-08-01" } });

  expect(await screen.findByRole("status")).toHaveTextContent("Loading the selected period…");
  expect(screen.getByRole("heading", { name: "Governed result" })).toBeInTheDocument();
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({
    question: "Show the statement for July 2026",
    selection: { ...selection, timeWindow: periodChoice.options[1]!.timeWindow },
  });
  rejectSwitch(new Error("transport failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent("The period could not be loaded. Try again.");
});

test("a pending period switch shows on its own answer and a failed one keeps the answer and shows why", async () => {
  let rejectSwitch!: (error: Error) => void;
  mocks.ask
    .mockResolvedValueOnce({ ...success, title: "First answer", periodControl })
    .mockResolvedValueOnce({ ...success, title: "Second answer", periodControl })
    .mockImplementationOnce(() => new Promise<AskResponse>((_resolve, reject) => (rejectSwitch = reject)));
  renderAsk();
  submit("First question");
  await screen.findByRole("heading", { name: "First answer" });
  submit("Second question");
  const second = (await screen.findByRole("heading", { name: "Second answer" })).closest("article")!;

  fireEvent.change(within(second).getByRole("combobox", { name: "Period" }), { target: { value: "2026-08-01" } });

  expect(await within(second).findByRole("status")).toHaveTextContent("Loading the selected period…");
  expect(
    within(screen.getByRole("heading", { name: "First answer" }).closest("article")!).queryByRole("status"),
  ).toBeNull();
  rejectSwitch(new Error("transport failed"));
  expect(await within(second).findByRole("alert")).toHaveTextContent("The period could not be loaded. Try again.");
  expect(within(second).getByRole("heading", { name: "Second answer" })).toBeInTheDocument();
});

test("the period select is disabled while the panel is globally pending", async () => {
  mocks.ask.mockResolvedValueOnce({ ...success, periodControl }).mockImplementationOnce(() => new Promise(() => {}));
  renderAsk();
  submit("First question");
  const period = await screen.findByRole("combobox", { name: "Period" });

  submit("Second question");

  expect(period).toBeDisabled();
});

test("clicking a period posts the cloned selection and the question untrimmed", async () => {
  mocks.ask.mockResolvedValueOnce(periodClarification).mockResolvedValueOnce(success);
  renderAsk();
  submit("Show the statement");

  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({
    question: "  Show the MIS statement Actual by statement leaf  ",
    selection: {
      ...selection,
      timeWindow: {
        grain: "month",
        column: "month",
        from: "2026-07-01",
        to: "2026-07-01",
      },
    },
  });
});

test("the untouched clarify options path still appends the chosen words", async () => {
  mocks.ask
    .mockResolvedValueOnce({
      responseClass: "clarification_needed" as AskResponse["responseClass"],
      sessionId: "session",
      clarify: { prompt: "Which period?", options: ["July 2026"], resumesQuestion: true },
      viewInReport: { available: false, reason: "Choose a period first." },
    })
    .mockResolvedValueOnce(success);
  renderAsk();
  submit("Show Actual");

  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({ question: "Show Actual (July 2026)" });
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
    expect(mocks.ask).toHaveBeenLastCalledWith(
      {
        question: "Define Budget",
        priorTurns: [{ question: "Show governed Actual", selection }],
      },
      expect.any(Object),
    ),
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

test("an answer resolving within the render delay shows no phase while a slower one shows them in order", async () => {
  vi.useFakeTimers();
  mocks.ask.mockImplementationOnce(async (_request, { onPhase }) => {
    onPhase("routing");
    return success;
  });
  renderAsk();
  submit("Fast answer");
  await act(async () => undefined);
  expect(vi.getTimerCount()).toBe(0);
  await act(() => vi.advanceTimersByTimeAsync(250));

  expect(screen.queryByRole("list", { name: "Answer progress" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Governed result" })).toBeInTheDocument();

  cleanup();
  let finish!: (response: AskResponse) => void;
  mocks.ask.mockImplementationOnce(
    (_request, { onPhase }) =>
      new Promise<AskResponse>((resolve) => {
        finish = resolve;
        onPhase("routing");
        onPhase("selecting");
        onPhase("querying");
        onPhase("summarizing");
      }),
  );
  renderAsk();
  submit("Slow answer");
  await act(() => vi.advanceTimersByTimeAsync(250));

  expect(screen.getByRole("list", { name: "Answer progress" })).toHaveTextContent(
    "Routing questionSelecting governed measuresQuerying governed dataSummarizing answer",
  );
  await act(async () => finish(success));
  expect(screen.queryByRole("list", { name: "Answer progress" })).not.toBeInTheDocument();
});

test("leaving the assistant aborts while collapsing the dock and moving to the ask page do not", async () => {
  mocks.pathname = "/mis-reports";
  mocks.ask.mockImplementation(
    (_request, { signal }) =>
      new Promise<AskResponse>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  const mounted = render(
    <AskProvider pathname={mocks.pathname}>
      <CollapseHarness />
    </AskProvider>,
  );
  submit("Keep this running");
  const signal = mocks.ask.mock.calls[0]?.[1].signal as AbortSignal;

  fireEvent.click(screen.getByRole("button", { name: "Collapse Ask" }));
  expect(signal.aborted).toBe(false);
  mocks.pathname = "/ask";
  mounted.rerender(
    <AskProvider pathname={mocks.pathname}>
      <CollapseHarness />
    </AskProvider>,
  );
  expect(signal.aborted).toBe(false);

  mocks.pathname = "/dashboard";
  mounted.rerender(
    <AskProvider pathname={mocks.pathname}>
      <CollapseHarness />
    </AskProvider>,
  );
  await waitFor(() => expect(signal.aborted).toBe(true));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  mounted.unmount();
  mocks.pathname = "/ask";
  const rerunMounted = render(
    <AskProvider pathname={mocks.pathname}>
      <RerunButton />
    </AskProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rerun stored selection" }));
  const rerunSignal = mocks.ask.mock.calls[1]?.[1]?.signal as AbortSignal;
  expect(rerunSignal.aborted).toBe(false);

  mocks.pathname = "/dashboard";
  rerunMounted.rerender(
    <AskProvider pathname={mocks.pathname}>
      <RerunButton />
    </AskProvider>,
  );
  await waitFor(() => expect(rerunSignal.aborted).toBe(true));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a stored selection rerun stays on the buffered route while an ordinary ask streams", async () => {
  mocks.ask.mockResolvedValue(success);
  render(
    <AskProvider>
      <AskPanel surface="page" />
      <RerunButton />
    </AskProvider>,
  );

  submit("Ordinary question");
  await screen.findByRole("heading", { name: "Governed result" });
  fireEvent.click(screen.getByRole("button", { name: "Rerun stored selection" }));
  await waitFor(() =>
    expect(mocks.ask).toHaveBeenCalledWith({ question: "Stored question", selection }, expect.any(Object)),
  );
  expect(mocks.ask).toHaveBeenNthCalledWith(1, { question: "Ordinary question" }, expect.any(Object));
  expect(mocks.ask).toHaveBeenNthCalledWith(2, { question: "Stored question", selection }, expect.any(Object));
});

test("an ordinary streaming http error renders as the buffered client does", async () => {
  mocks.ask.mockRejectedValue(new Error("API request failed with status 500"));
  renderAsk();
  submit("Fail over HTTP");

  expect(await screen.findByRole("alert")).toHaveTextContent("The question could not be sent. Try again.");
  expect(screen.queryByText("API request failed with status 500")).not.toBeInTheDocument();
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

function CollapseHarness() {
  const [open, setOpen] = useState(true);
  return open ? <AskPanel surface="docked" onCollapse={() => setOpen(false)} /> : <p>Ask collapsed</p>;
}

function RerunButton() {
  const { rerun } = useAsk();
  return (
    <button type="button" onClick={() => void rerun("Stored question", selection)}>
      Rerun stored selection
    </button>
  );
}
