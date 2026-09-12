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
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith({ question: "Budget", selection }));
  expect(mocks.push).toHaveBeenCalledWith("/ask");

  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "First pin" })).not.toBeInTheDocument());
  expect(mocks.deletePin).toHaveBeenCalledWith("first");
});

test("a non runnable row renders its refusal message and offers no open control on both surfaces", async () => {
  const status = {
    runnable: false as const,
    reason: "grant_revoked" as const,
    message: "You no longer have permission to run this selection.",
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

function pin(
  id: string,
  title: string,
  position: number,
  definitionChanged: boolean,
  status: Pin["status"] = { runnable: true },
): Pin {
  return {
    id,
    title,
    selection,
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
