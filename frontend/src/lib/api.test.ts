import { api } from "./api";
import { afterEach, expect, test, vi } from "vitest";

function response(status = 200, body: unknown = { ok: true }, headers: HeadersInit = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    blob: async () => (body instanceof Blob ? body : new Blob([JSON.stringify(body)])),
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

test("an export returning unauthorized triggers exactly one refresh and exactly one retried export carrying the csrf header and cookie credentials", async () => {
  let cookie = "";
  let csrfRequests = 0;
  let exportRequests = 0;
  Object.defineProperty(document, "cookie", { configurable: true, get: () => cookie });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:export"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) {
      cookie = `3f_csrf=token-${++csrfRequests}`;
      return response();
    }
    if (url.endsWith("/api/auth/refresh")) return response();
    if (url.endsWith("/api/mis/statement/export")) {
      exportRequests += 1;
      return exportRequests === 1
        ? response(401)
        : response(200, new Blob(["workbook"]), {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary",
          });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  await api.exportMisStatement({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
  });

  const exportCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/mis/statement/export"));
  const refreshCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/refresh"));
  expect(exportCalls).toHaveLength(2);
  expect(refreshCalls).toHaveLength(1);
  expect(
    exportCalls.map(([, init]) => ({
      csrf: (init?.headers as Record<string, string>)["x-csrf-token"],
      credentials: init?.credentials,
    })),
  ).toEqual([
    { csrf: "token-1", credentials: "include" },
    { csrf: "token-3", credentials: "include" },
  ]);
});

test("the saved filename comes from the content disposition header with a single fixed fallback when it is absent and the object url is revoked afterwards", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=export-token" });
  const createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  const revokeObjectURL = vi.fn();
  const downloads: string[] = [];
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  let exportRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/auth/csrf")) return response();
      exportRequests += 1;
      return response(
        200,
        new Blob(["workbook"]),
        exportRequests === 1
          ? {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": 'attachment; filename="financial-mis-server-name.xlsx"',
            }
          : { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      );
    }),
  );
  const selection = { department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" };

  await api.exportMisStatement(selection);
  await api.exportMisStatement(selection);

  expect(downloads).toEqual(["financial-mis-server-name.xlsx", "financial-mis-statement.xlsx"]);
  expect(revokeObjectURL.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
});

test("only an xlsx response is saved while json is returned and every other media type is rejected", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=export-token" });
  const createObjectURL = vi.fn(() => "blob:export");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const responses = [
    response(200, new Blob(["workbook"]), {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary",
    }),
    response(
      200,
      {
        outcome: "unresolvable",
        notice: "No mapping configured",
        tree: [],
        grandTotal: null,
        provenance: { activeBatchIds: [] },
      },
      { "Content-Type": "application/json; charset=utf-8" },
    ),
    response(200, new Blob(["not a workbook"]), { "Content-Type": "application/octet-stream" }),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/api/auth/csrf") ? response() : responses.shift()!,
    ),
  );
  const selection = { department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" };

  await expect(api.exportMisStatement(selection)).resolves.toBeUndefined();
  await expect(api.exportMisStatement(selection)).resolves.toMatchObject({
    outcome: "unresolvable",
    notice: "No mapping configured",
  });
  await expect(api.exportMisStatement(selection)).rejects.toThrow("Unexpected statement export content type");
  expect(createObjectURL).toHaveBeenCalledTimes(1);
});
