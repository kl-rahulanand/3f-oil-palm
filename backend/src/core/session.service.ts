import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { DRIZZLE_DB, loadConfig } from "../config";
import type { AppDb } from "../db/pool";
import { refreshTokens, sessions, users } from "../db/schema";

export interface SessionTokens {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
}

export interface VerifiedAccessSession {
  sessionId: string;
  userId: string;
  jti: string;
}

export interface RefreshTokenMeta {
  ua?: string;
  ip?: string;
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

type JwtPayload = {
  sub: string;
  sid: string;
  jti: string;
  typ: "access" | "refresh";
};

type DbExecutor =
  | AppDb
  | Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/** JWT-backed authentication sessions and refresh-token rotation. */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  #sweeping = false;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  onModuleInit(): void {
    const interval = loadConfig().sessionSweepIntervalMs;
    if (interval <= 0) return;

    this.sweepTimer = setInterval(() => {
      void this.runSweep();
    }, interval);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async create(userId: string, meta: RefreshTokenMeta = {}): Promise<SessionTokens> {
    const rows = await this.db
      .insert(sessions)
      .values({
        token: `jwt:${randomUUID()}`,
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      })
      .returning({ id: sessions.id });
    return this.issueTokens(userId, rows[0].id, meta);
  }

  async verifyAccess(token: string): Promise<VerifiedAccessSession | null> {
    const payload = this.verifyJwt(token, "access");
    if (!payload) return null;
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, payload.sid), eq(sessions.userId, payload.sub), gt(sessions.expiresAt, sql`now()`)))
      .limit(1);
    if (rows.length === 0) return null;
    return { sessionId: payload.sid, userId: payload.sub, jti: payload.jti };
  }

  async rotate(refreshToken: string, meta: RefreshTokenMeta = {}): Promise<SessionTokens | null> {
    const payload = this.verifyJwt(refreshToken, "refresh");
    if (!payload) return null;

    const rows = await this.db
      .select({
        id: refreshTokens.id,
        tokenHash: refreshTokens.tokenHash,
        expiresAt: refreshTokens.expiresAt,
        userId: refreshTokens.userId,
        userActive: users.isActive,
      })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(
        and(
          eq(refreshTokens.jti, payload.jti),
          eq(refreshTokens.userId, payload.sub),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || !row.userActive || row.expiresAt <= new Date()) return null;

    const matches = await bcrypt.compare(refreshToken, row.tokenHash);
    if (!matches) return null;

    // Atomic compare-and-swap: only the caller that flips revoked_at from NULL
    // wins. Under concurrent reuse of the same token both requests pass the
    // SELECT above, but the `isNull(revokedAt)` guard here lets exactly one
    // UPDATE match — the loser revokes nothing and is rejected, so a leaked or
    // replayed refresh token can never mint two successors.
    const revoked = await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.jti, payload.jti), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (revoked.length === 0) return null;

    return this.issueTokens(payload.sub, payload.sid, meta);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const payload = this.verifyJwt(refreshToken, "refresh", true);
    if (!payload) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.jti, payload.jti), isNull(refreshTokens.revokedAt)));
  }

  async deleteAllForUser(userId: string, executor?: DbExecutor): Promise<void> {
    const db = executor ?? this.db;
    await db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async sweepExpired(): Promise<number> {
    const staleRefresh = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, sql`now()`))
      .returning({ id: refreshTokens.id });
    const staleSessions = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, sql`now()`))
      .returning({ id: sessions.id });
    return staleRefresh.length + staleSessions.length;
  }

  private async runSweep(): Promise<void> {
    if (this.#sweeping) return;
    this.#sweeping = true;
    try {
      await this.sweepExpired();
    } catch {
      // Best-effort background cleanup; request paths still reject expired tokens.
    } finally {
      this.#sweeping = false;
    }
  }

  private async issueTokens(
    userId: string,
    sessionId: string,
    meta: RefreshTokenMeta,
  ): Promise<SessionTokens> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const secret = loadConfig().authJwtSecret;
    const accessToken = jwt.sign(
      { typ: "access", sid: sessionId } satisfies Pick<JwtPayload, "typ" | "sid">,
      secret,
      {
        subject: userId,
        jwtid: accessJti,
        expiresIn: ACCESS_TTL_SECONDS,
        audience: "pulse",
        issuer: "pulse-api",
        mutatePayload: false,
      },
    );
    const refreshToken = jwt.sign(
      { typ: "refresh", sid: sessionId } satisfies Pick<JwtPayload, "typ" | "sid">,
      secret,
      {
        subject: userId,
        jwtid: refreshJti,
        expiresIn: REFRESH_TTL_SECONDS,
        audience: "pulse",
        issuer: "pulse-api",
        mutatePayload: false,
      },
    );
    const tokenHash = await bcrypt.hash(refreshToken, loadConfig().bcryptRounds);
    await this.db.insert(refreshTokens).values({
      userId,
      jti: refreshJti,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      ua: meta.ua,
      ip: meta.ip,
    });
    return { sessionId, accessToken, refreshToken, refreshJti };
  }

  private verifyJwt(token: string, typ: JwtPayload["typ"], ignoreExpiration = false): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, loadConfig().authJwtSecret, {
        audience: "pulse",
        issuer: "pulse-api",
        ignoreExpiration,
      });
      if (!decoded || typeof decoded === "string") return null;
      const payload = decoded as jwt.JwtPayload & Partial<JwtPayload>;
      if (
        payload.typ !== typ ||
        typeof payload.sub !== "string" ||
        typeof payload.jti !== "string" ||
        typeof payload.sid !== "string"
      ) {
        return null;
      }
      return {
        sub: payload.sub,
        sid: typeof payload.sid === "string" ? payload.sid : "",
        jti: payload.jti,
        typ,
      };
    } catch {
      return null;
    }
  }
}
