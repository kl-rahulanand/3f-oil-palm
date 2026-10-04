import type { SavedQuery, Selection } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AskProvider, useAsk } from "@/src/features/assistant/use-ask";
import { renderWithQuery } from "@/src/test/render";
import { SavedViews } from "./saved-views";

const mocks = vi.hoisted(() => ({ savedQueries: vi.fn(), deleteSavedQuery: vi.fn(), ask: vi.fn(), push: vi.fn() }));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["gl_code"],
  filters: [{ dimensionId: "month", op: "eq", value: "2026-07-01" }],
};

const measureFilteredSelection: Selection = {
  ...selection,
  measureIds: ["governed-financial.actual", "governed-financial.budget"],
  measureFilters: [
    {
      measureId: "governed-financial.actual",
      op: "gt",
      compareTo: { kind: "measure", measureId: "governed-financial.budget" },
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("a saved row is labelled from the shared catalog and an unregistered definition falls back to its identifier marked unavailable", async () => {
  mocks.savedQueries.mockResolvedValue([
    saved("known", selection, { runnable: true }),
    saved(
      "removed",
      { ...selection, measureIds: ["retired.margin"] },
      {
        runnable: false,
        reason: "definition_unregistered",
        message: "This selection uses a definition that is no longer registered.",
      },
    ),
  ]);
  mocks.ask.mockResolvedValue({
    responseClass: "not_supported",
    sessionId: "session",
    message: "Not supported",
    viewInReport: { available: false, reason: "Not available." },
  });
  renderSaved();

  expect(await screen.findByRole("heading", { name: "Actual" })).toBeInTheDocument();
  expect(screen.getAllByText("GL code · Month: 2026-07-01")).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "retired.margin (unavailable)" })).toBeInTheDocument();
  expect(screen.getByText("This selection uses a definition that is no longer registered.")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() =>
    expect(mocks.ask).toHaveBeenCalledWith(
      { question: "Actual", selection, origin: "saved-view" },
      { signal: expect.any(AbortSignal) },
    ),
  );
  expect(mocks.push).toHaveBeenCalledWith("/ask");
});

test("a failed delete surfaces its error instead of dropping the row", async () => {
  mocks.savedQueries.mockResolvedValue([saved("known", selection, { runnable: true })]);
  mocks.deleteSavedQuery.mockRejectedValue(new Error("API request failed with status 500"));
  renderSaved();

  await screen.findByRole("heading", { name: "Actual" });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("The saved view could not be deleted. Try again.");
  expect(screen.getByRole("heading", { name: "Actual" })).toBeInTheDocument();
});

test("a list failure replaces the saved-view empty state", async () => {
  mocks.savedQueries.mockRejectedValue(new Error("API request failed with status 500"));
  renderSaved();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Saved views could not be loaded. Refresh the page to try again.",
  );
  expect(screen.queryByText("Save a successful Ask answer to reopen it here.")).not.toBeInTheDocument();
});

test("a successful saved-view delete removes the row only after the route succeeds", async () => {
  mocks.savedQueries.mockResolvedValue([saved("known", selection, { runnable: true })]);
  mocks.deleteSavedQuery.mockResolvedValue({ ok: true });
  renderSaved();

  await screen.findByRole("heading", { name: "Actual" });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByRole("heading", { name: "Actual" })).not.toBeInTheDocument());
  expect(mocks.deleteSavedQuery).toHaveBeenCalledWith("known");
});

test("a saved rerun rejected while another question is pending stays on the row", async () => {
  mocks.savedQueries.mockResolvedValue([saved("known", selection, { runnable: true })]);
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderWithQuery(
    <AskProvider>
      <PendingQuestion />
      <SavedViews />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "Actual" });
  fireEvent.click(screen.getByRole("button", { name: "Start question" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Another question is still running. Try opening this view when it finishes.",
  );
  expect(mocks.push).not.toHaveBeenCalled();
});

test("opening a saved view navigates before the request resolves", async () => {
  mocks.savedQueries.mockResolvedValue([saved("known", selection, { runnable: true })]);
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderSaved();

  await screen.findByRole("heading", { name: "Actual" });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(mocks.push).toHaveBeenCalledWith("/ask");
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

test("opening a saved view sends its stored measure comparison to Ask intact", async () => {
  mocks.savedQueries.mockResolvedValue([saved("filtered", measureFilteredSelection, { runnable: true })]);
  mocks.ask.mockResolvedValue(success("Filtered actual", measureFilteredSelection));
  renderSaved();

  await screen.findByRole("heading", { name: "Actual · Budget" });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  await waitFor(() =>
    expect(mocks.ask).toHaveBeenCalledWith(
      { question: "Actual · Budget", selection: measureFilteredSelection, origin: "saved-view" },
      { signal: expect.any(AbortSignal) },
    ),
  );
});

test("opening a saved view that matches an existing turn reruns it rather than appending", async () => {
  mocks.savedQueries.mockResolvedValue([saved("known", selection, { runnable: true })]);
  mocks.ask
    .mockResolvedValueOnce(success("Original actual", selection))
    .mockResolvedValueOnce(success("Fresh actual", selection));
  renderWithQuery(
    <AskProvider>
      <SeedTurn />
      <ThreadLength />
      <SavedViews />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "Actual" });
  fireEvent.click(screen.getByRole("button", { name: "Seed answered turn" }));
  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("1"));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({ question: "What was the actual?", selection, origin: "saved-view" });
  expect(screen.getByTestId("thread-length")).toHaveTextContent("1");
  expect(mocks.push).toHaveBeenCalledWith("/ask");
});

function saved(id: string, value: Selection, status: SavedQuery["status"]): SavedQuery {
  return { id, selection: value, status, createdAt: "2026-09-12T00:00:00.000Z" };
}

function renderSaved() {
  return renderWithQuery(
    <AskProvider>
      <SavedViews />
    </AskProvider>,
  );
}

function PendingQuestion() {
  const { ask } = useAsk();
  return (
    <button type="button" onClick={() => void ask("Question in progress")}>
      Start question
    </button>
  );
}

function SeedTurn() {
  const { ask } = useAsk();
  return (
    <button type="button" onClick={() => void ask("What was the actual?")}>
      Seed answered turn
    </button>
  );
}

function ThreadLength() {
  const { turns } = useAsk();
  return <output data-testid="thread-length">{turns.length}</output>;
}

function success(title: string, value: Selection) {
  return {
    responseClass: "success" as const,
    sessionId: "session",
    title,
    selection: value,
    viewInReport: { available: false as const, reason: "Not available." },
  };
}
