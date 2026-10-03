import {
  ASK_PRIOR_TURN_MAX_QUESTION_CHARS,
  ASK_PRIOR_TURNS_MAX_ENTRIES,
  ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS,
  AskDrillRequest,
  AskDrillResponse,
  type AskPriorTurn,
  AskRequest,
  AskResponse,
  AuthLogoutResponse,
  AuthMeResponse,
  AuthOtpRequestResponse,
  AuthOtpVerifyResponse,
  AuthRefreshResponse,
  CreatePinRequest,
  MisDrillRequest,
  MisDrillResponse,
  MisSelectionOptionsResponse,
  MisSelectionRunRequest,
  MisStatementRouteResponse,
  MisStatementUnresolvableResponse,
  Pin,
  SaveQueryRequest,
  SavedQuery,
  type WarehouseFreshnessResponse,
} from "@3f/contract";
import { readAskStream } from "@/src/features/assistant/ask-stream";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
const CSRF_PATH = "/api/auth/csrf";
const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXPORT_FALLBACK_FILENAME = "financial-mis-statement.xlsx";

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

function csrfCookie(): string {
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("3f_csrf="))
    ?.slice("3f_csrf=".length);
  return value ? decodeURIComponent(value) : "";
}

async function postResponse(path: string, body: object, refreshOn401 = false, signal?: AbortSignal): Promise<Response> {
  await request(CSRF_PATH, false, signal);
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfCookie(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (response.status === 401 && refreshOn401) {
    await post<AuthRefreshResponse>("/api/auth/refresh", {}, false, signal);
    return postResponse(path, body, false, signal);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

async function post<T>(path: string, body: object, refreshOn401 = false, signal?: AbortSignal): Promise<T> {
  const response = await postResponse(path, body, refreshOn401, signal);
  return response.json() as Promise<T>;
}

async function remove(path: string, refreshOn401 = false): Promise<{ ok: true }> {
  await request(CSRF_PATH);
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "x-csrf-token": csrfCookie() },
  });
  if (response.status === 401 && refreshOn401) {
    await post<AuthRefreshResponse>("/api/auth/refresh", {});
    return remove(path);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<{ ok: true }>;
}

async function exportMisStatement(
  selection: MisSelectionRunRequest,
): Promise<MisStatementUnresolvableResponse | undefined> {
  const response = await postResponse("/api/mis/statement/export", selection, true);
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "application/json") {
    return response.json() as Promise<MisStatementUnresolvableResponse>;
  }
  if (mediaType !== XLSX_MEDIA_TYPE) throw new Error("Unexpected statement export content type");

  const disposition = response.headers.get("Content-Disposition");
  const filename = disposition === null ? EXPORT_FALLBACK_FILENAME : dispositionFilename(disposition);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dispositionFilename(disposition: string): string {
  const match = /\bfilename=(?:"([^"]+)"|([^;]+))/i.exec(disposition);
  const filename = (match?.[1] ?? match?.[2])?.trim();
  if (!filename) throw new Error("Statement export filename is missing");
  return filename;
}

async function request<T = unknown>(path: string, refreshOn401 = false, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", signal });
  if (response.status === 401 && refreshOn401) {
    await post<AuthRefreshResponse>("/api/auth/refresh", {}, false, signal);
    return request<T>(path, false, signal);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

function boundedAskRequest(request: Pick<AskRequest, "question" | "priorTurns" | "selection" | "statementGrounding">) {
  if (!request.priorTurns?.length) return request;
  const priorTurns: AskPriorTurn[] = request.priorTurns.slice(-ASK_PRIOR_TURNS_MAX_ENTRIES).map((turn) => ({
    ...turn,
    question: turn.question.slice(0, ASK_PRIOR_TURN_MAX_QUESTION_CHARS),
  }));
  while (priorTurns.length && JSON.stringify(priorTurns).length > ASK_PRIOR_TURNS_MAX_SERIALIZED_CHARS) {
    priorTurns.shift();
  }
  return { ...request, ...(priorTurns.length ? { priorTurns } : { priorTurns: undefined }) };
}

type AskStreamOptions = { signal?: AbortSignal; onPhase?: Parameters<typeof readAskStream>[1] };

async function askStream(
  request: Pick<AskRequest, "question" | "priorTurns" | "statementGrounding">,
  options: AskStreamOptions = {},
): Promise<AskResponse> {
  const response = await postResponse("/api/chat/stream", boundedAskRequest(request), true, options.signal);
  return readAskStream(response.body, options.onPhase ?? (() => undefined));
}

export const api = {
  misOptions: () => request<MisSelectionOptionsResponse>("/api/mis/options", true),
  runMisStatement: (selection: MisSelectionRunRequest) =>
    post<MisStatementRouteResponse>("/api/mis/statement", selection, true),
  ask: (
    request: Pick<AskRequest, "question" | "priorTurns" | "selection" | "statementGrounding">,
    options?: AskStreamOptions,
  ) =>
    request.selection
      ? post<AskResponse>("/api/chat", boundedAskRequest(request), true, options?.signal)
      : options
        ? askStream(request, options)
        : post<AskResponse>("/api/chat", boundedAskRequest(request), true),
  askStream,
  warehouseFreshness: () => request<WarehouseFreshnessResponse>("/api/warehouse/freshness", true),
  savedQueries: () => request<SavedQuery[]>("/api/saved", true),
  saveQuery: (body: SaveQueryRequest) => post<SavedQuery>("/api/saved", body, true),
  deleteSavedQuery: (id: string) => remove(`/api/saved/${id}`, true),
  pins: () => request<Pin[]>("/api/pins", true),
  createPin: (body: CreatePinRequest) => post<Pin>("/api/pins", body, true),
  deletePin: (id: string) => remove(`/api/pins/${id}`, true),
  runMisDrill: (request: MisDrillRequest) => post<MisDrillResponse>("/api/mis/statement/drill", request, true),
  runAskDrill: (request: AskDrillRequest) => post<AskDrillResponse>("/api/chat/drill", request, true),
  exportMisStatement,
  csrf: () => request<{ ok: true }>(CSRF_PATH),
  requestOtp: (email: string) => post<AuthOtpRequestResponse>("/api/auth/otp/request", { email }),
  verifyOtp: (email: string, code: string) => post<AuthOtpVerifyResponse>("/api/auth/otp/verify", { email, code }),
  me: () => request<AuthMeResponse>("/api/auth/me", true),
  logout: () => post<AuthLogoutResponse>("/api/auth/logout", {}, true),
};
