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

function streamResponse(status: number, events: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(events));
        controller.close();
      },
    }),
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

test("the ask client posts to the governed chat route with the csrf header and a body of question and qualifying prior turns only", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=ask-token" });
  const result = {
    responseClass: "informational",
    sessionId: "session",
    title: "Actual",
    definition: "The governed actual amount.",
    viewInReport: { available: false, reason: "Definitions do not open a report." },
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).endsWith("/api/chat") ? response(200, result) : response(),
  );
  vi.stubGlobal("fetch", fetchMock);
  const priorTurns = [
    {
      question: "Show governed Actual",
      selection: {
        domain: "mis-statement",
        measureIds: ["mis-statement.actual"],
        dimensionIds: ["mis-statement.leaf_key"],
        filters: [],
      },
    },
  ];

  await expect(api.ask({ question: "Define Actual", priorTurns })).resolves.toEqual(result);

  const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/chat"))!;
  expect(String(url)).toBe("http://127.0.0.1:4000/api/chat");
  expect(init).toMatchObject({
    method: "POST",
    credentials: "include",
    body: JSON.stringify({ question: "Define Actual", priorTurns }),
  });
  expect((init?.headers as Record<string, string>)["x-csrf-token"]).toBe("ask-token");
  expect(Object.keys(JSON.parse(String(init?.body))).sort()).toEqual(["priorTurns", "question"]);
});

test("the streaming client sends the csrf header and refreshes once on a 401", async () => {
  let cookie = "";
  let csrfRequests = 0;
  let streamRequests = 0;
  Object.defineProperty(document, "cookie", { configurable: true, get: () => cookie });
  const event = `data: ${JSON.stringify({
    type: "result",
    response: {
      responseClass: "informational",
      sessionId: "session",
      title: "Actual",
      viewInReport: { available: false, reason: "Definitions do not open a report." },
    },
  })}\n\n`;
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) {
      cookie = `3f_csrf=stream-token-${++csrfRequests}`;
      return response();
    }
    if (url.endsWith("/api/auth/refresh")) return response();
    if (url.endsWith("/api/chat/stream"))
      return ++streamRequests === 1 ? streamResponse(401, "") : streamResponse(200, event);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  await api.askStream({ question: "Define Actual" });

  const calls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/chat/stream"));
  expect(calls).toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/refresh"))).toHaveLength(1);
  expect(calls.map(([, init]) => (init?.headers as Record<string, string>)["x-csrf-token"])).toEqual([
    "stream-token-1",
    "stream-token-3",
  ]);
  expect(calls.every(([, init]) => init?.credentials === "include")).toBe(true);
});

test("the client trims prior turns to the shared limits so a ninth turn still succeeds", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=ask-token" });
  const event = `data: ${JSON.stringify({ type: "result", response: { ...resultForTrim(), sessionId: "session" } })}\n\n`;
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).endsWith("/api/chat/stream") ? streamResponse(200, event) : response(),
  );
  vi.stubGlobal("fetch", fetchMock);
  const priorTurns = Array.from({ length: 9 }, (_, index) => ({
    question: `Question ${index + 1}`,
    selection: {
      domain: "mis-statement",
      measureIds: ["mis-statement.actual"],
      dimensionIds: [],
      filters: [],
    },
  }));

  await api.askStream({ question: "Question 10", priorTurns });

  const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/chat/stream"))!;
  expect(JSON.parse(String(init?.body)).priorTurns.map((turn: { question: string }) => turn.question)).toEqual([
    "Question 2",
    "Question 3",
    "Question 4",
    "Question 5",
    "Question 6",
    "Question 7",
    "Question 8",
    "Question 9",
  ]);
});

function resultForTrim() {
  return {
    responseClass: "informational",
    title: "Actual",
    definition: "The governed actual amount.",
    viewInReport: { available: false, reason: "Definitions do not open a report." },
  };
}

test("opening a saved view posts the stored selection with no report grounding", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=rerun-token" });
  const result = {
    responseClass: "success",
    sessionId: "session",
    viewInReport: { available: false, reason: "Not a statement selection." },
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).endsWith("/api/chat") ? response(200, result) : response(),
  );
  vi.stubGlobal("fetch", fetchMock);
  const selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
  };

  await api.ask({ question: "Actual", selection });

  const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/chat"))!;
  expect(String(url)).toBe("http://127.0.0.1:4000/api/chat");
  expect(init).toMatchObject({
    method: "POST",
    credentials: "include",
    body: JSON.stringify({ question: "Actual", selection }),
  });
  expect((init?.headers as Record<string, string>)["x-csrf-token"]).toBe("rerun-token");
  expect(Object.keys(JSON.parse(String(init?.body))).sort()).toEqual(["question", "selection"]);
  expect(JSON.parse(String(init?.body))).not.toHaveProperty("reportGrounding");
});

test("saved-view and pin mutations use their governed routes with csrf", async () => {
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "3f_csrf=explore-token" });
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response());
  vi.stubGlobal("fetch", fetchMock);
  const selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: [],
    filters: [],
  };

  await api.saveQuery({ selection });
  await api.createPin({ title: "Actual", selection });
  await api.deleteSavedQuery("saved-id");
  await api.deletePin("pin-id");

  const mutations = fetchMock.mock.calls.filter(([input]) => !String(input).endsWith("/api/auth/csrf"));
  expect(mutations.map(([input, init]) => [String(input), init?.method, init?.body])).toEqual([
    ["http://127.0.0.1:4000/api/saved", "POST", JSON.stringify({ selection })],
    ["http://127.0.0.1:4000/api/pins", "POST", JSON.stringify({ title: "Actual", selection })],
    ["http://127.0.0.1:4000/api/saved/saved-id", "DELETE", undefined],
    ["http://127.0.0.1:4000/api/pins/pin-id", "DELETE", undefined],
  ]);
  expect(
    mutations.every(([, init]) => (init?.headers as Record<string, string>)["x-csrf-token"] === "explore-token"),
  ).toBe(true);
});

test("the drill client posts to the governed drill route with the csrf header and the pinned batches untouched", async () => {
  let cookie = "";
  let csrfRequests = 0;
  let drillRequests = 0;
  Object.defineProperty(document, "cookie", { configurable: true, get: () => cookie });
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) {
      cookie = `3f_csrf=drill-token-${++csrfRequests}`;
      return response();
    }
    if (url.endsWith("/api/auth/refresh")) return response();
    if (url.endsWith("/api/mis/statement/drill")) {
      drillRequests += 1;
      return drillRequests === 1
        ? response(401)
        : response(200, {
            nodeKey: "diesel",
            leafKey: "diesel",
            lines: [],
            footer: { debit: "0.00", credit: "0.00", value: "0.00" },
            totalCount: 0,
            page: 1,
            pageSize: 100,
            actualBatchIds: [],
            budgetBatchId: "budget-july",
            batchStatuses: [],
          });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const pinnedBatches = [
    { source: "actuals" as const, period: "2026-07-01", batchId: "actuals-july" },
    { source: "budget" as const, period: "2026-07-01", batchId: "budget-july" },
  ];
  const request = {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    nodeKey: "diesel",
    block: "selected" as const,
    pinnedBatches,
    page: 1,
  };

  await api.runMisDrill(request);

  const calls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/mis/statement/drill"));
  expect(calls).toHaveLength(2);
  expect(calls.map(([, init]) => JSON.parse(String(init?.body)).pinnedBatches)).toEqual([pinnedBatches, pinnedBatches]);
  expect(calls.map(([, init]) => (init?.headers as Record<string, string>)["x-csrf-token"])).toEqual([
    "drill-token-1",
    "drill-token-3",
  ]);
  expect(calls.every(([input]) => String(input) === "http://127.0.0.1:4000/api/mis/statement/drill")).toBe(true);
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
