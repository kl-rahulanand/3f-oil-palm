import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SessionGuard } from "./session-guard";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => ({ me: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/src/lib/api", () => ({ api: { me: mocks.me } }));

test("redirects to login only after the refresh retry also fails", async () => {
  let fail!: () => void;
  mocks.me.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = () => reject(new Error("unauthorized"));
      }),
  );
  renderWithQuery(<SessionGuard>{() => <div>Dashboard</div>}</SessionGuard>);

  expect(screen.getByText("Checking your session…")).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  fail();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
});
