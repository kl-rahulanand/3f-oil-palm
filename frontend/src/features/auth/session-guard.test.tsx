import { screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SessionGuard } from "./session-guard";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public readonly status: number) {
      super(`API request failed with status ${status}`);
    }
  }
  return { me: vi.fn(), replace: vi.fn(), ApiError };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/src/lib/api", () => ({ ApiError: mocks.ApiError, api: { me: mocks.me } }));

beforeEach(() => {
  mocks.me.mockReset();
  mocks.replace.mockReset();
});

test("redirects to login only after the refresh retry also fails", async () => {
  let fail!: () => void;
  mocks.me.mockImplementation(
    () =>
      new Promise((_, reject) => {
        // api.me refreshes once and retries; a failed retry surfaces as ApiError 401.
        fail = () => reject(new mocks.ApiError(401));
      }),
  );
  renderWithQuery(<SessionGuard>{() => <div>Dashboard</div>}</SessionGuard>);

  expect(screen.getByText("Checking your session…")).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  fail();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
});

test("does not redirect to login when the session check fails for a non-auth reason", async () => {
  // A 5xx (or network/malformed/CSRF-bootstrap failure) is transient, not a lost
  // session — the guard must keep the user out of the login bounce and show an error.
  mocks.me.mockRejectedValue(new mocks.ApiError(503));
  renderWithQuery(<SessionGuard>{() => <div>Dashboard</div>}</SessionGuard>);

  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
});
