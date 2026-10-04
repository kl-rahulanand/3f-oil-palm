import type { Pin, SavedQuery, Selection } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AskProvider, useAsk } from "@/src/features/assistant/use-ask";
import { renderWithQuery } from "@/src/test/render";
import { PinnedReports } from "./pinned-reports";
import { SavedViews } from "./saved-views";

const mocks = vi.hoisted(() => ({
  pins: vi.fn(),
  savedQueries: vi.fn(),
  deletePin: vi.fn(),
  deleteSavedQuery: vi.fn(),
  ask: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/src/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.budget"],
  dimensionIds: ["month"],
  filters: [],
};

const measureFilteredSelection: Selection = {
  ...selection,
  measureIds: ["governed-financial.actual", "governed-financial.budget"],
  dimensionIds: ["gl_code"],
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

test("a pinned row renders metadata only in position order with a changed definition surfaced and no figure", async () => {
  mocks.pins.mockResolvedValue([pin("second", "Second pin", 2, false), pin("first", "First pin", 1, true)]);
  mocks.ask.mockResolvedValue({
    responseClass: "not_supported",
    sessionId: "session",
    message: "Not supported",
    viewInReport: { available: false, reason: "Not available." },
  });
  mocks.deletePin.mockResolvedValue({ ok: true });
  renderPins();

  await screen.findByRole("heading", { name: "First pin" });
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "First pin",
    "Second pin",
  ]);
  expect(screen.getByText("Definition changed")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
  await waitFor(() =>
    expect(mocks.ask).toHaveBeenCalledWith(
      { question: "Budget", selection, origin: "pin" },
      { signal: expect.any(AbortSignal) },
    ),
  );
  expect(mocks.push).toHaveBeenCalledWith("/ask");

  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "First pin" })).not.toBeInTheDocument());
  expect(mocks.deletePin).toHaveBeenCalledWith("first");
});

test("a plants-revoked row renders its reason and offers no open control on both surfaces", async () => {
  const status = {
    runnable: false as const,
    reason: "plants_revoked" as const,
    message:
      "This view includes plants you no longer have access to: Agriculture - Nursery - CHIR. Edit its plants to run it.",
  };
  mocks.pins.mockResolvedValue([pin("pin", "Restricted pin", 0, false, status)]);
  renderPins();

  expect(await screen.findByText(status.message)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

  cleanup();
  const saved: SavedQuery = { id: "saved", selection, status, createdAt: "2026-09-12T00:00:00.000Z" };
  mocks.savedQueries.mockResolvedValue([saved]);
  renderWithQuery(
    <AskProvider>
      <SavedViews />
    </AskProvider>,
  );

  expect(await screen.findByText(status.message)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
});

test("a failed pin delete surfaces its error instead of dropping the row", async () => {
  mocks.pins.mockResolvedValue([pin("pin", "Pinned budget", 0, false)]);
  mocks.deletePin.mockRejectedValue(new Error("API request failed with status 500"));
  renderPins();

  await screen.findByRole("heading", { name: "Pinned budget" });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("The pinned report could not be deleted. Try again.");
  expect(screen.getByRole("heading", { name: "Pinned budget" })).toBeInTheDocument();
});

test("a pinned rerun rejected while another question is pending stays on the row", async () => {
  mocks.pins.mockResolvedValue([pin("pin", "Pinned budget", 0, false)]);
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderWithQuery(
    <AskProvider>
      <PendingQuestion />
      <PinnedReports />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "Pinned budget" });
  fireEvent.click(screen.getByRole("button", { name: "Start question" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Another question is still running. Try opening this report when it finishes.",
  );
  expect(mocks.push).not.toHaveBeenCalled();
});

test("opening a pin navigates before the request resolves", async () => {
  mocks.pins.mockResolvedValue([pin("pin", "Pinned budget", 0, false)]);
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderPins();

  await screen.findByRole("heading", { name: "Pinned budget" });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(mocks.push).toHaveBeenCalledWith("/ask");
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

test("opening a pin sends its stored measure comparison to Ask intact", async () => {
  mocks.pins.mockResolvedValue([
    pin("filtered", "Filtered actual", 0, false, { runnable: true }, measureFilteredSelection),
  ]);
  mocks.ask.mockResolvedValue(success("Filtered actual", measureFilteredSelection));
  renderPins();

  await screen.findByRole("heading", { name: "Filtered actual" });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  await waitFor(() =>
    expect(mocks.ask).toHaveBeenCalledWith(
      { question: "Actual · Budget", selection: measureFilteredSelection, origin: "pin" },
      { signal: expect.any(AbortSignal) },
    ),
  );
});

test("opening while another request runs shows the busy message and does not navigate", async () => {
  mocks.pins.mockResolvedValue([pin("pin", "Pinned budget", 0, false)]);
  mocks.ask.mockImplementation(() => new Promise(() => undefined));
  renderWithQuery(
    <AskProvider>
      <PendingQuestion />
      <PinnedReports />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "Pinned budget" });
  fireEvent.click(screen.getByRole("button", { name: "Start question" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Another question is still running. Try opening this report when it finishes.",
  );
  expect(mocks.push).not.toHaveBeenCalled();
});

test("opening a pin that matches an existing turn reruns it rather than appending", async () => {
  mocks.pins.mockResolvedValue([pin("pin", "Pinned budget", 0, false)]);
  mocks.ask
    .mockResolvedValueOnce(success("Original budget", selection))
    .mockResolvedValueOnce(success("Fresh budget", selection));
  renderWithQuery(
    <AskProvider>
      <SeedTurn />
      <ThreadLength />
      <PinnedReports />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "Pinned budget" });
  fireEvent.click(screen.getByRole("button", { name: "Seed answered turn" }));
  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("1"));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]?.[0]).toEqual({ question: "What was the budget?", selection, origin: "pin" });
  expect(screen.getByTestId("thread-length")).toHaveTextContent("1");
  expect(mocks.push).toHaveBeenCalledWith("/ask");
});

test("opening two reports that share a label title but differ produces two distinct turns", async () => {
  const byMonth = {
    ...selection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
  };
  const byGlCode = { ...byMonth, dimensionIds: ["gl_code"] };
  mocks.pins.mockResolvedValue([
    pin("month", "By month", 0, false, { runnable: true }, byMonth),
    pin("gl-code", "By GL code", 1, false, { runnable: true }, byGlCode),
  ]);
  mocks.ask.mockResolvedValueOnce(success("By month", byMonth)).mockResolvedValueOnce(success("By GL code", byGlCode));
  renderWithQuery(
    <AskProvider>
      <ThreadLength />
      <PinnedReports />
    </AskProvider>,
  );

  await screen.findByRole("heading", { name: "By month" });
  fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("1"));
  fireEvent.click(screen.getAllByRole("button", { name: "Open" })[1]!);

  await waitFor(() => expect(screen.getByTestId("thread-length")).toHaveTextContent("2"));
  expect(mocks.ask.mock.calls.map(([request]) => request)).toEqual([
    { question: "Actual · Budget", selection: byMonth, origin: "pin" },
    { question: "Actual · Budget", selection: byGlCode, origin: "pin" },
  ]);
});

function pin(
  id: string,
  title: string,
  position: number,
  definitionChanged: boolean,
  status: Pin["status"] = { runnable: true },
  value: Selection = selection,
): Pin {
  return {
    id,
    title,
    selection: value,
    status,
    definitionVersion: "version",
    definitionChanged,
    position,
    createdAt: "2026-09-12T00:00:00.000Z",
  };
}

function renderPins() {
  return renderWithQuery(
    <AskProvider>
      <PinnedReports />
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
    <button type="button" onClick={() => void ask("What was the budget?")}>
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
