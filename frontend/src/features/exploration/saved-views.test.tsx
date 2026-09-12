import type { SavedQuery, Selection } from "@3f/contract";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AskProvider } from "@/src/features/assistant/use-ask";
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
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith({ question: "Actual", selection }));
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
