// Hermetic BEHAVIOR test: jsdom verifies the drawer's semantics — aria-expanded,
// Escape-to-close, and focus return — which need no CSS layout. jsdom applies no
// CSS or media queries, so browser-level RESPONSIVE VISUAL fidelity at 390x844 is
// not this test's job; it is verified in the recorded functional check (host-run in
// a real browser at 1440x900 and 390x844), per this task's evidence split.
import type { AuthUser } from "@3f/contract";
import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppShell } from "./app-shell";
import { renderWithQuery } from "@/src/test/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const user: AuthUser = {
  id: "user-1",
  email: "admin@example.invalid",
  display_name: "R. Venkatesh",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [],
};

test("the mobile nav drawer toggles aria-expanded and Escape closes it and restores focus", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  renderWithQuery(
    <AppShell user={user}>
      <div>Canvas</div>
    </AppShell>,
  );

  const toggle = screen.getByRole("button", { name: "Open navigation" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
});
