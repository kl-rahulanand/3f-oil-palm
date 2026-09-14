import type { AuthUser } from "@3f/contract";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AppShell } from "./app-shell";
import { renderWithQuery } from "@/src/test/render";

const mocks = vi.hoisted(() => ({ freshness: vi.fn(), logout: vi.fn() }));

vi.mock("@/src/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number) {
      super();
    }
  },
  api: { warehouseFreshness: mocks.freshness, logout: mocks.logout },
}));

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

afterEach(() => {
  cleanup();
  mocks.freshness.mockReset();
  mocks.logout.mockReset();
});

test("enables MIS Reports navigation and reflects the active page title", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  mocks.freshness.mockResolvedValue({ status: "unsupported", freshnessKind: "load" });
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
  expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
  expect(screen.getByRole("link", { name: "Explore / Saved" })).toHaveAttribute("href", "/explore");
  for (const label of labels.slice(4)) {
    const item = navigation.getByText(label).closest(".nav-item");
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item?.tagName).toBe("SPAN");
  }
  expect(screen.getByPlaceholderText("Search components, GL codes, plants")).toBeDisabled();
  expect(await screen.findByText("Load freshness · Not reported by this warehouse")).not.toHaveAttribute(
    "aria-disabled",
  );
});

test("the explore nav item resolves to a live destination", () => {
  mocks.freshness.mockResolvedValue({ status: "unsupported", freshnessKind: "load" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  renderWithQuery(
    <AppShell user={user}>
      <div>Canvas</div>
    </AppShell>,
  );

  expect(screen.getByRole("link", { name: "Explore / Saved" })).toHaveAttribute("href", "/explore");
});

test("the freshness pill renders each of the five states and is no longer disabled", async () => {
  const cases = [
    [
      { status: "available", freshnessKind: "load", oldestUploadedAtUtc: "2026-09-14T12:30:00.000Z", sources: [] },
      /Load freshness · .* UTC/,
    ],
    [{ status: "no-active-batches", freshnessKind: "load" }, "Load freshness · No active batches"],
    [{ status: "unsupported", freshnessKind: "load" }, "Load freshness · Not reported by this warehouse"],
    [{ status: "unconfigured", freshnessKind: "load" }, "Load freshness · Warehouse not configured"],
    [{ status: "lookup-failed", freshnessKind: "load" }, "Load freshness · Warehouse lookup failed"],
  ] as const;

  for (const [freshness, copy] of cases) {
    mocks.freshness.mockResolvedValueOnce(freshness);
    const mounted = renderWithQuery(
      <AppShell user={user}>
        <div>Canvas</div>
      </AppShell>,
    );
    const pill = await screen.findByText(copy);
    expect(pill).not.toHaveAttribute("aria-disabled");
    mounted.unmount();
  }

  mocks.freshness.mockRejectedValueOnce(new Error("browser offline"));
  renderWithQuery(
    <AppShell user={user}>
      <div>Canvas</div>
    </AppShell>,
  );
  expect(await screen.findByText("Load freshness · Could not check")).toBeInTheDocument();
  expect(screen.queryByText("Load freshness · Warehouse lookup failed")).not.toBeInTheDocument();
});
