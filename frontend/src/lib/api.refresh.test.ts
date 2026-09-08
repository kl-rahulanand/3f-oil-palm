import { api } from "./api";
import { expect, test, vi } from "vitest";

function response(status = 200, body: object = { ok: true }): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const user = {
  id: "user-1",
  email: "admin@example.invalid",
  display_name: "R. Venkatesh",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [],
};

test("refreshes once then retries on an access-token 401 but never on an otp verify 401", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=current" });
  let meCalls = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) return ++meCalls === 1 ? response(401) : response(200, user);
    if (url.endsWith("/api/auth/otp/verify")) return response(401);
    return response();
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(api.me()).resolves.toEqual(user);
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/refresh"))).toHaveLength(1);

  fetchMock.mockClear();
  await expect(api.verifyOtp(user.email, "111111")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/auth/refresh"))).toBe(false);
});
