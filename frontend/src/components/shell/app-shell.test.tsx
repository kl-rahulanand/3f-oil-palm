import type { AuthUser } from "@3f/contract";
import { screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppShell } from "./app-shell";
import { renderWithQuery } from "@/src/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/mis-reports",
  useRouter: () => ({ replace: vi.fn() }),
}));

const user: AuthUser = {
  id: "user-1",
  email: "admin@example.invalid",
  display_name: "R. Venkatesh",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [],
};

test("enables MIS Reports navigation and reflects the active page title without making feature API calls", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderWithQuery(
    <AppShell user={user}>
      <div>Canvas</div>
    </AppShell>,
  );

  const labels = ["Dashboard", "MIS Reports", "Ask", "Explore / Saved", "Admin"];
  const navigation = within(screen.getByRole("navigation"));
  expect(labels.map((label) => navigation.getByText(label).textContent)).toEqual(labels);
  expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", { name: "MIS Reports" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("MIS Reports", { selector: ".page-title" })).toBeInTheDocument();
  for (const label of labels.slice(2)) {
    const item = navigation.getByText(label).closest(".nav-item");
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item?.tagName).toBe("SPAN");
  }
  expect(screen.getByPlaceholderText("Search components, GL codes, plants")).toBeDisabled();
  expect(screen.getByText("Freshness unavailable")).toHaveAttribute("aria-disabled", "true");
  expect(fetchMock).not.toHaveBeenCalled();
});
