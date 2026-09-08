import type { AuthUser } from "@3f/contract";
import { screen, within } from "@testing-library/react";
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

test("renders five nav labels with only Dashboard active and disabled items make no feature API calls", () => {
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
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  for (const label of labels.slice(1)) {
    const item = navigation.getByText(label).closest(".nav-item");
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item?.tagName).toBe("SPAN");
  }
  expect(screen.getByPlaceholderText("Search components, GL codes, plants")).toBeDisabled();
  expect(screen.getByText("Freshness unavailable")).toHaveAttribute("aria-disabled", "true");
  expect(fetchMock).not.toHaveBeenCalled();
});
