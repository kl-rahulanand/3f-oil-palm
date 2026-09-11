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

test("MIS data methods use cookie credentials CSRF bootstrap and one refresh retry", async () => {
  let cookie = "";
  Object.defineProperty(document, "cookie", { configurable: true, get: () => cookie });
  let bootstrap = 0;
  let optionsAttempts = 0;
  let runAttempts = 0;
  const options = { departments: [], functions: [], plants: [], periods: [] };
  const result = {
    outcome: "unresolvable",
    notice: "No mapping configured",
    result: { columns: [], rows: [] },
    totals: { actual: 0, budget: 0, percentage: null },
    bucketRows: [],
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) {
      cookie = `3f_csrf=mis-token-${++bootstrap}`;
      return response();
    }
    if (url.endsWith("/api/auth/refresh")) return response();
    if (url.endsWith("/api/mis/options")) return ++optionsAttempts === 1 ? response(401) : response(200, options);
    if (url.endsWith("/api/mis/run")) return ++runAttempts === 1 ? response(401) : response(200, result);
    return response(404);
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(api.misOptions()).resolves.toEqual(options);
  await expect(
    api.runMisSelection({ department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" }),
  ).resolves.toEqual(result);

  const optionsCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/mis/options"));
  const runCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/mis/run"));
  expect(optionsCalls).toHaveLength(2);
  expect(runCalls).toHaveLength(2);
  expect([...optionsCalls, ...runCalls].every(([, init]) => init?.credentials === "include")).toBe(true);
  expect(runCalls.map(([, init]) => (init?.headers as Record<string, string>)["x-csrf-token"])).toEqual([
    "mis-token-2",
    "mis-token-4",
  ]);
  expect(runCalls[1][1]?.body).toBe(
    JSON.stringify({ department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" }),
  );
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/refresh"))).toHaveLength(2);
});

test("the MIS statement method posts the four selectors to the governed statement route", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=statement-token" });
  const result = {
    outcome: "unresolvable",
    notice: "No mapping configured",
    tree: [],
    grandTotal: null,
    provenance: { activeBatchIds: [] },
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).endsWith("/api/mis/statement") ? response(200, result) : response(),
  );
  vi.stubGlobal("fetch", fetchMock);

  const selection = { department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" };
  await expect(api.runMisStatement(selection)).resolves.toEqual(result);

  const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/mis/statement"))!;
  expect(init).toMatchObject({
    method: "POST",
    credentials: "include",
    body: JSON.stringify(selection),
  });
  expect((init?.headers as Record<string, string>)["x-csrf-token"]).toBe("statement-token");
});
