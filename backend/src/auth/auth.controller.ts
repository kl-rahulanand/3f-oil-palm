import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type {
  AuthMeResponse,
  AuthOtpRequest,
  AuthOtpRequestResponse,
  AuthOtpVerifyRequest,
  AuthOtpVerifyResponse,
  AuthRefreshResponse,
  AuthUser,
  Permissions,
  ScopeAttr,
} from "@3f/contract";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Response } from "express";
import { DRIZZLE_DB, loadConfig } from "../config";
import { zodApiBody } from "../common/openapi";
import type { AppDb } from "../db/pool";
import { otpCodes, rolePerms, userRoles, userScope, users } from "../db/schema";
import { AuditService } from "../core/audit.service";
import { SessionService } from "../core/session.service";
import { createEmailService, type EmailService } from "../email/email.service";
import { AuthGuard, type AuthedRequest } from "./auth.guard";
import { AUTH_API_DESCRIPTIONS, AUTH_MESSAGES, AUTH_RATE_LIMIT } from "./auth.constants";
import { AUTH_COOKIE_NAMES, clearAuthCookies, ensureCsrfCookie, readCookie, setAuthCookies } from "./cookies";
import { emptyBodySchema, otpRequestSchema, otpVerifySchema } from "./auth.schemas";
import { LoginRateLimitService } from "./rate-limit.service";

@ApiTags("auth")
@Controller("api/auth")
export class AuthController {
  private readonly email: EmailService;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly rateLimit: LoginRateLimitService,
  ) {
    this.email = createEmailService();
  }

  @Post("otp/request")
  @ApiOperation({ summary: "Request a passwordless email OTP" })
  @ApiBody(zodApiBody(otpRequestSchema))
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: AUTH_API_DESCRIPTIONS.otpRequested,
    schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: AUTH_API_DESCRIPTIONS.tooManyOtpAttempts })
  async requestOtp(
    @Body() body: AuthOtpRequest,
    @Req() req: AuthedRequest,
  ): Promise<AuthOtpRequestResponse> {
    const parsed = otpRequestSchema.safeParse(body);
    const email = parsed.success ? parsed.data.email.trim().toLowerCase() : "";
    const ip = req.ip ?? "";
    if (parsed.success) this.rateLimit.check(email, ip);

    const user = parsed.success ? await this.findProvisionedUser(email) : null;
    await this.audit.writeAuthEvent({ eventType: "auth.otp_requested", userId: user?.id });
    if (!user) return { ok: true };

    const recent = await this.db
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.userId, user.id),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.createdAt, new Date(Date.now() - AUTH_RATE_LIMIT.resendCooldownMs)),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (recent[0]) return { ok: true };

    const code = generateOtpCode();
    const codeHash = await bcrypt.hash(code, loadConfig().bcryptRounds);
    await this.db.insert(otpCodes).values({
      userId: user.id,
      codeHash,
      expiresAt: new Date(Date.now() + AUTH_RATE_LIMIT.otpExpiresMs),
    });
    await this.email.sendOtp({
      to: user.email,
      code,
      expiresInMinutes: AUTH_RATE_LIMIT.otpExpiresMs / 60_000,
    });

    return { ok: true };
  }

  @Post("otp/verify")
  @ApiOperation({ summary: "Verify an email OTP and create a session" })
  @ApiBody(zodApiBody(otpVerifySchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: AUTH_API_DESCRIPTIONS.otpVerified })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: AUTH_API_DESCRIPTIONS.invalidOtp })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: AUTH_API_DESCRIPTIONS.tooManyOtpAttempts })
  async verifyOtp(
    @Body() body: AuthOtpVerifyRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthOtpVerifyResponse> {
    const parsed = otpVerifySchema.safeParse(body);
    const ip = req.ip ?? "";
    if (!parsed.success) throw new UnauthorizedException(AUTH_MESSAGES.invalidOtp);

    const email = parsed.data.email.trim().toLowerCase();
    this.rateLimit.check(email, ip);

    const user = await this.findProvisionedUser(email);
    if (!user) {
      await this.audit.writeAuthEvent({ eventType: "auth.otp_failed" });
      throw new UnauthorizedException(AUTH_MESSAGES.invalidOtp);
    }

    const row = (
      await this.db
        .select({
          id: otpCodes.id,
          codeHash: otpCodes.codeHash,
          expiresAt: otpCodes.expiresAt,
          attempts: otpCodes.attempts,
        })
        .from(otpCodes)
        .where(and(eq(otpCodes.userId, user.id), isNull(otpCodes.consumedAt)))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1)
    )[0];

    if (!row || row.expiresAt <= new Date()) {
      if (row) await this.consumeOtp(row.id);
      await this.audit.writeAuthEvent({ eventType: "auth.otp_failed", userId: user.id });
      throw new UnauthorizedException(AUTH_MESSAGES.invalidOtp);
    }

    const matchesHash = await bcrypt.compare(parsed.data.code, row.codeHash);
    const matchesMockFixedCode = this.email.acceptsFixedOtp(parsed.data.code);
    if (!matchesHash && !matchesMockFixedCode) {
      const attempts = row.attempts + 1;
      await this.db
        .update(otpCodes)
        .set({
          attempts,
          consumedAt: attempts >= AUTH_RATE_LIMIT.otpAttemptCap ? sql`now()` : null,
        })
        .where(eq(otpCodes.id, row.id));
      await this.audit.writeAuthEvent({ eventType: "auth.otp_failed", userId: user.id });
      throw new UnauthorizedException(AUTH_MESSAGES.invalidOtp);
    }

    await this.consumeOtp(row.id);
    this.rateLimit.recordSuccess(email, ip);
    const tokens = await this.sessions.create(user.id, requestMeta(req));
    setAuthCookies(res, tokens);
    await this.audit.writeAuthEvent({
      eventType: "auth.otp_verified",
      userId: user.id,
      sessionId: tokens.sessionId,
    });
    return this.resolveAuthUser(user.id);
  }

  @Get("csrf")
  @ApiOperation({ summary: "Set a readable CSRF cookie for double-submit requests" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "CSRF cookie set.",
    schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
  })
  csrf(@Res({ passthrough: true }) res: Response): { ok: true } {
    ensureCsrfCookie(res);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Return the current authenticated user" })
  @ApiResponse({ status: HttpStatus.OK, description: "Authenticated user returned." })
  me(@Req() req: AuthedRequest): AuthMeResponse {
    if (!req.authUser) throw new UnauthorizedException(AUTH_MESSAGES.missingToken);
    return req.authUser;
  }

  @Post("refresh")
  @ApiOperation({ summary: "Rotate the refresh cookie and issue fresh session cookies" })
  @ApiBody({ required: false, ...zodApiBody(emptyBodySchema) })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Refresh token rotated.",
    schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: AUTH_API_DESCRIPTIONS.invalidSession })
  async refresh(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthRefreshResponse> {
    const refreshToken = readCookie(req, AUTH_COOKIE_NAMES.refresh);
    if (!refreshToken) throw new UnauthorizedException(AUTH_MESSAGES.invalidOrExpiredSession);
    const tokens = await this.sessions.rotate(refreshToken, requestMeta(req));
    if (!tokens) throw new UnauthorizedException(AUTH_MESSAGES.invalidOrExpiredSession);
    setAuthCookies(res, tokens);
    return { ok: true };
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Delete the current cookie session" })
  @ApiBody({ required: false, ...zodApiBody(emptyBodySchema) })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: AUTH_API_DESCRIPTIONS.sessionDeleted,
    schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: AUTH_API_DESCRIPTIONS.invalidSession,
  })
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    if (req.refreshToken) await this.sessions.revokeRefreshToken(req.refreshToken);
    clearAuthCookies(res);
    return { ok: true };
  }

  private async findProvisionedUser(email: string): Promise<{ id: string; email: string } | null> {
    const rows = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async consumeOtp(id: string): Promise<void> {
    await this.db.update(otpCodes).set({ consumedAt: sql`now()` }).where(eq(otpCodes.id, id));
  }

  private async resolveAuthUser(userId: string): Promise<AuthUser> {
    const user = (
      await this.db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    if (!user || !user.isActive) throw new UnauthorizedException(AUTH_MESSAGES.invalidOtp);

    const roles = (
      await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))
    ).map((r) => r.role);
    const permissions = await this.resolvePermissions(roles);
    const scope: ScopeAttr[] = (
      await this.db
        .select({ attribute: userScope.attribute, value: userScope.value })
        .from(userScope)
        .where(eq(userScope.userId, userId))
    ).map((s) => ({ attribute: s.attribute, value: s.value }));

    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      is_active: user.isActive,
      roles,
      permissions,
      scope,
    };
  }

  private async resolvePermissions(roles: string[]): Promise<Permissions> {
    if (roles.length === 0)
      return { domains: [], measureIds: [], dimensionIds: [], actions: [] };

    const rows = await this.db
      .select({ grantType: rolePerms.grantType, grantId: rolePerms.grantId })
      .from(rolePerms)
      .where(inArray(rolePerms.role, roles));
    const pick = (type: string) =>
      rows.filter((row) => row.grantType === type).map((row) => row.grantId);
    return {
      domains: [...new Set(pick("domain"))],
      measureIds: [...new Set(pick("measure"))],
      dimensionIds: [...new Set(pick("dimension"))],
      actions: [...new Set(pick("action"))],
    };
  }
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function requestMeta(req: AuthedRequest): { ua?: string; ip?: string } {
  const ua = req.headers["user-agent"];
  return {
    ua: Array.isArray(ua) ? ua.join(", ") : ua,
    ip: req.ip,
  };
}
