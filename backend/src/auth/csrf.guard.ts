import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES, CSRF_HEADER, csrfMatches, ensureCsrfCookie, readCookie } from "./cookies";

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

    const res = ctx.switchToHttp().getResponse<Response>();
    ensureCsrfCookie(res);
    const header = req.headers[CSRF_HEADER];
    const headerToken = Array.isArray(header) ? header[0] : header;
    const cookieToken = readCookie(req, AUTH_COOKIE_NAMES.csrf);
    if (!csrfMatches(cookieToken, headerToken)) {
      throw new ForbiddenException("missing or invalid CSRF token");
    }
    return true;
  }
}
