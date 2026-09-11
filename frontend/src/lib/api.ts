import type {
  AuthLogoutResponse,
  AuthMeResponse,
  AuthOtpRequestResponse,
  AuthOtpVerifyResponse,
  AuthRefreshResponse,
  MisSelectionOptionsResponse,
  MisSelectionRunRequest,
  MisStatementRunResponse,
} from "@3f/contract";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
const CSRF_PATH = "/api/auth/csrf";

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

async function post<T>(path: string, body: object, refreshOn401 = false): Promise<T> {
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
    return post<T>(path, body);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
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
  csrf: () => request<{ ok: true }>(CSRF_PATH),
  requestOtp: (email: string) => post<AuthOtpRequestResponse>("/api/auth/otp/request", { email }),
  verifyOtp: (email: string, code: string) => post<AuthOtpVerifyResponse>("/api/auth/otp/verify", { email, code }),
  me: () => request<AuthMeResponse>("/api/auth/me", true),
  logout: () => post<AuthLogoutResponse>("/api/auth/logout", {}, true),
};
