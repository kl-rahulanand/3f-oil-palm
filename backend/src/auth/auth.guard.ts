import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "@3f/contract";
import { SessionService } from "../core/session.service";
import { RbacService } from "../core/rbac.service";
import { AUTH_MESSAGES } from "./auth.constants";
import { AUTH_COOKIE_NAMES, readCookie } from "./cookies";

export interface AuthedRequest extends Request {
  authUser?: AuthUser;
  sessionId?: string;
  refreshToken?: string;
}

/**
 * Fail-closed JWT cookie guard. Missing/invalid token or inactive users DENY.
 * Attaches the resolved RBAC user + sessionId to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req, AUTH_COOKIE_NAMES.access);
    if (!token) throw new UnauthorizedException(AUTH_MESSAGES.missingToken);

    const session = await this.sessions.verifyAccess(token).catch(() => null);
    if (!session) throw new UnauthorizedException(AUTH_MESSAGES.invalidOrExpiredSession);

    const user = await this.rbac.resolveUser(session.userId).catch(() => null);
    if (!user || !user.is_active) throw new UnauthorizedException(AUTH_MESSAGES.userNotFound);

    req.authUser = user;
    req.sessionId = session.sessionId;
    req.refreshToken = readCookie(req, AUTH_COOKIE_NAMES.refresh);
    return true;
  }
}

export { JwtAuthGuard as AuthGuard };

/** Requires the "admin" action grant (fail-closed). Use after AuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authUser?.permissions.actions.includes("admin"))
      throw new ForbiddenException(AUTH_MESSAGES.adminOnly);
    return true;
  }
}

/** Requires explicit membership in the DBA role. Administrators are not implicitly DBAs. */
@Injectable()
export class DbaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authUser?.roles.includes("dba")) {
      throw new ForbiddenException(AUTH_MESSAGES.dbaOnly);
    }
    return true;
  }
}

/** Requires an action grant (fail-closed). Use after AuthGuard. */
export function RequireAction(action: string): new () => CanActivate {
  @Injectable()
  class ActionGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const req = ctx.switchToHttp().getRequest<AuthedRequest>();
      if (!req.authUser?.permissions.actions.includes(action)) {
        throw new ForbiddenException(`Requires '${action}' action`);
      }
      return true;
    }
  }

  return ActionGuard;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authUser) throw new UnauthorizedException();
    return req.authUser;
  },
);

export const SessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.sessionId ?? "";
});
