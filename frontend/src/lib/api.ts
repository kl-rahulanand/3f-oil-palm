import type {
  AuthLogoutResponse,
  AuthMeResponse,
  AuthOtpRequestResponse,
  AuthOtpVerifyResponse,
  AuthRefreshResponse,
  MisDrillRequest,
  MisDrillResponse,
  MisSelectionOptionsResponse,
  MisSelectionRunRequest,
  MisStatementRunResponse,
  MisStatementUnresolvableResponse,
} from "@3f/contract";

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

async function postResponse(path: string, body: object, refreshOn401 = false): Promise<Response> {
  await request(CSRF_PATH);
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfCookie(),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 && refreshOn401) {
    await post<AuthRefreshResponse>("/api/auth/refresh", {});
    return postResponse(path, body);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

async function post<T>(path: string, body: object, refreshOn401 = false): Promise<T> {
  const response = await postResponse(path, body, refreshOn401);
  return response.json() as Promise<T>;
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

async function request<T = unknown>(path: string, refreshOn401 = false): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (response.status === 401 && refreshOn401) {
    await post<AuthRefreshResponse>("/api/auth/refresh", {});
    return request<T>(path);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export const api = {
  misOptions: () => request<MisSelectionOptionsResponse>("/api/mis/options", true),
  runMisStatement: (selection: MisSelectionRunRequest) =>
    post<MisStatementRunResponse>("/api/mis/statement", selection, true),
  runMisDrill: (request: MisDrillRequest) => post<MisDrillResponse>("/api/mis/statement/drill", request, true),
  exportMisStatement,
  csrf: () => request<{ ok: true }>(CSRF_PATH),
  requestOtp: (email: string) => post<AuthOtpRequestResponse>("/api/auth/otp/request", { email }),
  verifyOtp: (email: string, code: string) => post<AuthOtpVerifyResponse>("/api/auth/otp/verify", { email, code }),
  me: () => request<AuthMeResponse>("/api/auth/me", true),
  logout: () => post<AuthLogoutResponse>("/api/auth/logout", {}, true),
};
