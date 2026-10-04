import type { AskResponse, AskStatementGrounding, Selection } from "@3f/contract";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AskPanel } from "./ask-panel";
import { AskProvider, useAsk } from "./use-ask";

const mocks = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/src/lib/api", () => ({ api: mocks }));

const selection: Selection = {
  domain: "mis-statement",
  measureIds: ["mis-statement.actual"],
  dimensionIds: ["mis-statement.leaf_key"],
  filters: [],
};

function clarification(question = "Same question"): AskResponse {
  return {
    responseClass: "clarification_needed" as AskResponse["responseClass"],
    sessionId: "session",
    periodChoice: {
      prompt: "Choose a period",
      question,
      selection,
      options: [
        {
          value: "2026-07-01",
          label: "July 2026",
          timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
        },
      ],
    },
    viewInReport: { available: false, reason: "Choose a period first." },
  };
}

const success: AskResponse = {
  responseClass: "success" as AskResponse["responseClass"],
  sessionId: "session",
  title: "Statement result",
  selection,
  viewInReport: { available: false, reason: "Not available." },
};

const resultSuccess: AskResponse = {
  ...success,
  title: "Original answer",
  result: {
    columns: [{ key: "actual", label: "Actual", numeric: true }],
    rows: [{ actual: "12345.67" }],
  },
};

const grounding: AskStatementGrounding = {
  attestedContext: "claims.signature",
  department: "Agriculture",
  function: "Nursery",
  focus: { nodeKey: "shade", block: "selected", subject: "actual" },
  nodeMetadata: [{ nodeKey: "shade", glCodes: ["5001"], costCentres: ["Primary"] }],
  nodeAmounts: [{ nodeKey: "shade", block: "selected", actualPaise: "5000" }],
};

const groundedSuccess: AskResponse = {
  ...success,
  title: undefined,
  statementGrounding: { outcome: "focus-required" },
};

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  mocks.ask.mockReset();
});

test("a continuation targets its turn by a stable id not by question or index", async () => {
  mocks.ask
    .mockResolvedValueOnce(clarification())
    .mockResolvedValueOnce(clarification())
    .mockResolvedValueOnce(success);
  renderProvider();

  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  await screen.findByTestId("turn-1");
  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  await screen.findByTestId("turn-2");
  fireEvent.click(within(screen.getByTestId("turn-2")).getByRole("button", { name: "July 2026" }));

  await waitFor(() => expect(within(screen.getByTestId("turn-2")).getByText("Statement result")).toBeInTheDocument());
  expect(within(screen.getByTestId("turn-1")).getByText("Choose a period")).toBeInTheDocument();
  expect(screen.getByTestId("turn-1").dataset.turnId).not.toBe(screen.getByTestId("turn-2").dataset.turnId);
});

test("a period continuation keeps the plant filter and sends its origin", async () => {
  const plantSelection: Selection = {
    ...selection,
    filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
  };
  mocks.ask
    .mockResolvedValueOnce({
      ...clarification("Original plant-scoped question"),
      periodChoice: {
        ...clarification().periodChoice!,
        question: "Original plant-scoped question",
        selection: plantSelection,
      },
    })
    .mockResolvedValueOnce(success);
  renderProvider();

  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({
    question: "Original plant-scoped question",
    selection: {
      ...plantSelection,
      timeWindow: clarification().periodChoice!.options[0]!.timeWindow,
    },
    origin: "period-choice",
  });
});

test("a grounded turn is not rendered on the ask page", async () => {
  mocks.ask.mockResolvedValueOnce(groundedSuccess);
  render(
    <AskProvider>
      <AskPanel surface="page" />
      <GroundedButton />
    </AskProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ask grounded" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledOnce());

  expect(screen.queryByText("How is this built?")).not.toBeInTheDocument();
});

test("a grounded turn is excluded from the prior turns an ungrounded ask sends", async () => {
  mocks.ask.mockResolvedValueOnce(success).mockResolvedValueOnce(groundedSuccess).mockResolvedValueOnce(success);
  render(
    <AskProvider>
      <OwnershipHarness />
    </AskProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ask ordinary first" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent(/^ungrounded$/));
  fireEvent.click(screen.getByRole("button", { name: "Ask grounded" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent("ungrounded,grounded"));
  fireEvent.click(screen.getByRole("button", { name: "Ask ordinary next" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent("ungrounded,grounded,ungrounded"));

  expect(mocks.ask.mock.calls[2]?.[0].priorTurns).toEqual([{ question: "Ordinary first", selection }]);
});

test("a grounded explanation is cleared when a different statement is generated while ordinary turns survive", async () => {
  const pendingGrounded = deferred<AskResponse>();
  mocks.ask
    .mockResolvedValueOnce(success)
    .mockResolvedValueOnce(groundedSuccess)
    .mockReturnValueOnce(pendingGrounded.promise);
  render(
    <AskProvider>
      <OwnershipHarness />
    </AskProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Load first statement" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask ordinary first" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent("ungrounded"));
  fireEvent.click(screen.getByRole("button", { name: "Ask grounded" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent("ungrounded,grounded"));
  fireEvent.click(screen.getByRole("button", { name: "Ask grounded" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole("button", { name: "Load next statement" }));
  await waitFor(() => expect(screen.getByTestId("turn-origins")).toHaveTextContent(/^ungrounded$/));
  await act(async () => pendingGrounded.resolve(groundedSuccess));

  expect(screen.getByTestId("turn-origins")).toHaveTextContent(/^ungrounded$/);
});

test("a non success typed response keeps the clarification and its period buttons", async () => {
  mocks.ask.mockResolvedValueOnce(clarification()).mockResolvedValueOnce({
    responseClass: "informational" as AskResponse["responseClass"],
    sessionId: "session",
    title: "Actual",
    definition: "A glossary definition.",
    viewInReport: { available: false, reason: "Not available." },
  });
  renderProvider();
  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("Choose a period")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "July 2026" })).toBeEnabled();
  expect(screen.queryByText("A glossary definition.")).not.toBeInTheDocument();
});

test("a continuation whose transport throws keeps the clarification and its period buttons", async () => {
  mocks.ask.mockResolvedValueOnce(clarification()).mockRejectedValueOnce(new Error("network down"));
  renderProvider();
  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("Choose a period")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "July 2026" })).toBeEnabled();
});

test("reopening a report already answered reruns that turn and appends nothing", async () => {
  mocks.ask.mockResolvedValueOnce({ ...success, title: "First answer" }).mockResolvedValueOnce({
    ...success,
    title: "Refreshed answer",
  });
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Ask original wording" }));
  await screen.findByText("First answer");
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  expect(await screen.findByText("Refreshed answer")).toBeInTheDocument();
  expect(screen.getByTestId("thread-length")).toHaveTextContent("1");
});

test("a non success turn carrying a selection is not a candidate", async () => {
  mocks.ask.mockResolvedValueOnce({
    responseClass: "not_supported" as AskResponse["responseClass"],
    sessionId: "session",
    selection,
    message: "No mapping configured.",
    viewInReport: { available: false, reason: "Not available." },
  });
  mocks.ask.mockResolvedValueOnce(success);
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Ask original wording" }));
  await screen.findByText("No mapping configured.");
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  await screen.findByText("Statement result");
  expect(screen.getByTestId("thread-length")).toHaveTextContent("2");
});

test("an unmatched open appends one pending turn before the response arrives", async () => {
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  expect(await screen.findByTestId("turn-1")).toHaveTextContent("Actual · Budget");
  expect(screen.getByTestId("turn-1")).toHaveTextContent("pending");
  expect(screen.getByTestId("thread-length")).toHaveTextContent("1");
});

test("an unmatched open that fails leaves one turn carrying the error not two", async () => {
  mocks.ask.mockRejectedValue(new Error("network down"));
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  expect(await screen.findByText("This report could not be reopened. Try again.")).toBeInTheDocument();
  expect(screen.getByTestId("thread-length")).toHaveTextContent("1");
});

test("an aborted unmatched open leaves no empty turn", async () => {
  mocks.ask.mockImplementation(
    (_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  const view = render(
    <AskProvider pathname="/ask">
      <ReopenHarness />
    </AskProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));
  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("1"));
  view.rerender(
    <AskProvider pathname="/dashboard">
      <ReopenHarness />
    </AskProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("0"));
});

test("the most recent matching turn is the one rerun", async () => {
  mocks.ask
    .mockResolvedValueOnce({ ...success, title: "Older answer" })
    .mockResolvedValueOnce({ ...success, title: "Newer answer" })
    .mockResolvedValueOnce({ ...success, title: "Rerun answer" });
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Ask original wording" }));
  await screen.findByText("Older answer");
  fireEvent.click(screen.getByRole("button", { name: "Ask newer wording" }));
  await screen.findByText("Newer answer");
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  await screen.findByText("Rerun answer");
  expect(screen.getByTestId("turn-1")).toHaveTextContent("Older answer");
  expect(screen.getByTestId("turn-2")).toHaveTextContent("Rerun answer");
});

test("a matched rerun sends the turn question not the report label", async () => {
  mocks.ask.mockResolvedValueOnce(success).mockResolvedValueOnce(success);
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Ask original wording" }));
  await screen.findByText("Statement result");
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));

  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({ question: "What did July actually cost?", selection });
});

test("saved-view and pin reruns send their origin for unmatched and matched selections", async () => {
  mocks.ask.mockResolvedValue(success);
  render(
    <AskProvider>
      <OriginHarness />
    </AskProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open saved view" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Open pin" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));

  expect(mocks.ask.mock.calls.map(([request]) => request)).toEqual([
    { question: "Saved report", selection, origin: "saved-view" },
    { question: "Saved report", selection, origin: "pin" },
  ]);
});

test("a reopen blocked by policy removes the numbers from the turn", async () => {
  mocks.ask.mockResolvedValueOnce(resultSuccess).mockResolvedValueOnce({
    responseClass: "blocked_by_policy" as AskResponse["responseClass"],
    sessionId: "session",
    message: "You no longer have access to this report.",
    viewInReport: { available: false, reason: "Access changed." },
  });
  renderReopenPanel();

  await seedPanelAnswer();
  expect(screen.getByText("12345.67")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  expect(await screen.findByText("You no longer have access to this report.")).toBeInTheDocument();
  expect(screen.queryByText("12345.67")).not.toBeInTheDocument();
});

test("a terminal unauthorized and a terminal forbidden both clear with generic copy", async () => {
  for (const status of [401, 403]) {
    mocks.ask.mockResolvedValueOnce(resultSuccess).mockRejectedValueOnce({ status });
    const view = renderReopenPanel();

    await seedPanelAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

    expect(await screen.findByText("Sign in again to reopen this report.")).toBeInTheDocument();
    expect(screen.queryByText("12345.67")).not.toBeInTheDocument();
    view.unmount();
    mocks.ask.mockReset();
  }
});

test("not supported and a transport failure both keep the previous answer", async () => {
  mocks.ask
    .mockResolvedValueOnce(resultSuccess)
    .mockResolvedValueOnce({
      responseClass: "not_supported" as AskResponse["responseClass"],
      sessionId: "session",
      message: "No mapping configured.",
      viewInReport: { available: false, reason: "Not available." },
    })
    .mockRejectedValueOnce(new Error("network down"));
  renderReopenPanel();

  await seedPanelAnswer();
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));
  await screen.findByText("No mapping configured.");
  expect(screen.getByText("12345.67")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));
  await screen.findByText("This report could not be reopened. Try again.");
  expect(screen.getByText("12345.67")).toBeInTheDocument();
});

test("a refused period switch still retains the previous answer", async () => {
  mocks.ask.mockResolvedValueOnce(clarification()).mockResolvedValueOnce({
    responseClass: "blocked_by_policy" as AskResponse["responseClass"],
    sessionId: "session",
    message: "Access refused.",
    viewInReport: { available: false, reason: "Access refused." },
  });
  renderProvider();

  fireEvent.click(screen.getByRole("button", { name: "Ask same question" }));
  fireEvent.click(await screen.findByRole("button", { name: "July 2026" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("Choose a period")).toBeInTheDocument();
});

test("a terminal unauthorized does not navigate away from the thread", async () => {
  mocks.ask
    .mockResolvedValueOnce({ ...success, title: "Unrelated answer", selection: { ...selection, limit: 10 } })
    .mockResolvedValueOnce(resultSuccess)
    .mockRejectedValueOnce({ status: 401 });
  renderReopenHarness();

  fireEvent.click(screen.getByRole("button", { name: "Ask original wording" }));
  await screen.findByText("Unrelated answer");
  fireEvent.click(screen.getByRole("button", { name: "Ask newer wording" }));
  await screen.findByText("Original answer");
  fireEvent.click(screen.getByRole("button", { name: "Reopen saved report" }));

  expect(await screen.findByText("Sign in again to reopen this report.")).toBeInTheDocument();
  expect(screen.getByText("Unrelated answer")).toBeInTheDocument();
  expect(screen.getByTestId("thread-length")).toHaveTextContent("2");
});

function renderProvider() {
  return render(
    <AskProvider>
      <Harness />
    </AskProvider>,
  );
}

function renderReopenHarness() {
  return render(
    <AskProvider>
      <ReopenHarness />
    </AskProvider>,
  );
}

function renderReopenPanel() {
  return render(
    <AskProvider>
      <AskPanel surface="page" />
      <ReopenButton />
    </AskProvider>,
  );
}

async function seedPanelAnswer() {
  fireEvent.click(screen.getByRole("button", { name: "Show Actual and Budget by GL code for July 2026" }));
  await screen.findByText("Original answer");
}

function ReopenButton() {
  const { rerun } = useAsk();
  return (
    <button type="button" onClick={() => void rerun("Actual · Budget", selection)}>
      Reopen saved report
    </button>
  );
}

function OriginHarness() {
  const { rerun } = useAsk();
  return (
    <>
      <button type="button" onClick={() => void rerun("Saved report", selection, "saved-view")}>
        Open saved view
      </button>
      <button type="button" onClick={() => void rerun("Pinned report", selection, "pin")}>
        Open pin
      </button>
    </>
  );
}

function GroundedButton() {
  const { askGrounded } = useAsk();
  return (
    <button type="button" onClick={() => void askGrounded("How is this built?", grounding)}>
      Ask grounded
    </button>
  );
}

function OwnershipHarness() {
  const { turns, ask, askGrounded, syncStatementIdentity } = useAsk();
  return (
    <>
      <button type="button" onClick={() => syncStatementIdentity("statement-a")}>
        Load first statement
      </button>
      <button type="button" onClick={() => syncStatementIdentity("statement-b")}>
        Load next statement
      </button>
      <button type="button" onClick={() => void ask("Ordinary first")}>
        Ask ordinary first
      </button>
      <button type="button" onClick={() => void askGrounded("How is this built?", grounding)}>
        Ask grounded
      </button>
      <button type="button" onClick={() => void ask("Ordinary next")}>
        Ask ordinary next
      </button>
      <output data-testid="turn-origins">{turns.map((turn) => turn.origin).join(",")}</output>
    </>
  );
}

function ReopenHarness() {
  const { turns, ask, rerun } = useAsk();
  return (
    <>
      <button type="button" onClick={() => void ask("What did July actually cost?")}>
        Ask original wording
      </button>
      <button type="button" onClick={() => void ask("Show the newer result")}>
        Ask newer wording
      </button>
      <button type="button" onClick={() => void rerun("Actual · Budget", selection)}>
        Reopen saved report
      </button>
      <output data-testid="thread-length">{turns.length}</output>
      {turns.map((turn, index) => (
        <article key={turn.id} data-testid={`turn-${index + 1}`}>
          <p>{turn.question}</p>
          <p>{turn.response?.title ?? turn.response?.message ?? (turn.isPending ? "pending" : undefined)}</p>
          {turn.error && <p>{turn.error}</p>}
        </article>
      ))}
    </>
  );
}

function Harness() {
  const { turns, ask, continueTurn } = useAsk();
  return (
    <>
      <button type="button" onClick={() => void ask("Same question")}>
        Ask same question
      </button>
      {turns.map((turn, index) => (
        <article key={turn.id} data-testid={`turn-${index + 1}`} data-turn-id={turn.id}>
          {turn.response!.periodChoice ? (
            <>
              <p>{turn.response!.periodChoice!.prompt}</p>
              <button
                type="button"
                disabled={turn.isPending}
                onClick={() =>
                  void continueTurn(
                    turn.id,
                    turn.response!.periodChoice!.question,
                    {
                      ...turn.response!.periodChoice!.selection,
                      timeWindow: turn.response!.periodChoice!.options[0]!.timeWindow,
                    },
                    "retain",
                    "period-choice",
                  )
                }
              >
                July 2026
              </button>
            </>
          ) : (
            <p>{turn.response!.title}</p>
          )}
          {turn.error && <p role="alert">{turn.error}</p>}
        </article>
      ))}
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
