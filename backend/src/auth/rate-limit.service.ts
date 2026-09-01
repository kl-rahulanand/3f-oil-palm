import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AUTH_MESSAGES, AUTH_RATE_LIMIT } from "./auth.constants";

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, number[]>();

  check(email: string, ip: string): void {
    const keys = [`email:${email.toLowerCase()}`, `ip:${ip}`, `pair:${ip}:${email.toLowerCase()}`];
    const now = Date.now();

    for (const key of keys) this.prune(key, now);
    if (keys.some((key) => (this.attempts.get(key)?.length ?? 0) >= AUTH_RATE_LIMIT.limit)) {
      throw new HttpException(AUTH_MESSAGES.tooManyAttempts, HttpStatus.TOO_MANY_REQUESTS);
    }

    // TODO(A1/prod): in-memory limiter is per-instance; move to a shared store (Redis/DB) or gateway for multi-instance deployments.
    for (const key of keys) this.attempts.set(key, [...(this.attempts.get(key) ?? []), now]);
  }

  recordSuccess(email: string, ip: string): void {
    this.attempts.delete(`email:${email.toLowerCase()}`);
    this.attempts.delete(`ip:${ip}`);
    this.attempts.delete(`pair:${ip}:${email.toLowerCase()}`);
  }

  private prune(key: string, now: number): void {
    const window = (this.attempts.get(key) ?? []).filter(
      (ts) => now - ts < AUTH_RATE_LIMIT.windowMs,
    );
    if (window.length === 0) {
      this.attempts.delete(key);
    } else {
      this.attempts.set(key, window);
    }
  }
}
