import type { AskResponse, Selection } from "@3f/contract";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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

function renderProvider() {
  return render(
    <AskProvider>
      <Harness />
    </AskProvider>,
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
          {turn.response.periodChoice ? (
            <>
              <p>{turn.response.periodChoice.prompt}</p>
              <button
                type="button"
                disabled={turn.isPending}
                onClick={() =>
                  void continueTurn(turn.id, turn.response.periodChoice!.question, {
                    ...turn.response.periodChoice!.selection,
                    timeWindow: turn.response.periodChoice!.options[0]!.timeWindow,
                  })
                }
              >
                July 2026
              </button>
            </>
          ) : (
            <p>{turn.response.title}</p>
          )}
          {turn.error && <p role="alert">{turn.error}</p>}
        </article>
      ))}
    </>
  );
}
