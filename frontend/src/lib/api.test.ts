import { api } from "./api";
import { expect, test, vi } from "vitest";

function response(status = 200, body: object = { ok: true }): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

test("re-reads the 3f_csrf cookie on every mutating request", async () => {
  let cookie = "";
  Object.defineProperty(document, "cookie", { configurable: true, get: () => cookie });
  let bootstrap = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) {
      cookie = `3f_csrf=token-${++bootstrap}`;
      return response();
    }
    if (url.endsWith("/api/auth/otp/verify")) return response(200, {});
    return response();
  });
  vi.stubGlobal("fetch", fetchMock);

  await api.requestOtp("admin@example.invalid");
  await api.verifyOtp("admin@example.invalid", "000000");
  await api.logout();

  const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts.map(([, init]) => (init?.headers as Record<string, string>)["x-csrf-token"])).toEqual([
    "token-1",
    "token-2",
    "token-3",
  ]);
  expect(posts.every(([, init]) => init?.credentials === "include")).toBe(true);
  expect(posts.map(([input]) => String(input))).toEqual([
    "http://127.0.0.1:4000/api/auth/otp/request",
    "http://127.0.0.1:4000/api/auth/otp/verify",
    "http://127.0.0.1:4000/api/auth/logout",
  ]);
});
