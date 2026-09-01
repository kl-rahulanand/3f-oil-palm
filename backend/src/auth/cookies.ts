import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { loadConfig } from "../config";

export const AUTH_COOKIE_NAMES = {
  access: "pulse_access",
  refresh: "pulse_refresh",
  csrf: "pulse_csrf",
} as const;

export const CSRF_HEADER = "x-csrf-token";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_MAX_AGE_MS = REFRESH_MAX_AGE_MS;

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[name];
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const secure = loadConfig().nodeEnv === "production";
  res.cookie(AUTH_COOKIE_NAMES.access, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(AUTH_COOKIE_NAMES.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE_MS,
  });
  ensureCsrfCookie(res);
}

export function clearAuthCookies(res: Response): void {
  const secure = loadConfig().nodeEnv === "production";
  for (const name of [AUTH_COOKIE_NAMES.access, AUTH_COOKIE_NAMES.refresh]) {
    res.clearCookie(name, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: name === AUTH_COOKIE_NAMES.refresh ? "/api/auth" : "/",
    });
  }
}

export function ensureCsrfCookie(res: Response, token = createCsrfToken()): string {
  res.cookie(AUTH_COOKIE_NAMES.csrf, token, {
    httpOnly: false,
    secure: loadConfig().nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CSRF_MAX_AGE_MS,
  });
  return token;
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfMatches(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const parsed: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    parsed[key] = decodeURIComponent(value);
  }
  return parsed;
}
