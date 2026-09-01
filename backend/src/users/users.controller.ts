import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { AuthUser, ScopeAttr } from "@pulse/contract";
import { DRIZZLE_DB } from "../config";
import { zodApiBody } from "../common/openapi";
import type { AppDb } from "../db/pool";
import { userRoles, userScope, users } from "../db/schema";
import { AuthGuard, AdminGuard, CurrentUser } from "../auth/auth.guard";
import { AuditService } from "../core/audit.service";
import { RBAC_MESSAGES, RbacService } from "../core/rbac.service";
import { SessionService } from "../core/session.service";
import { USERS_API_DESCRIPTIONS, USERS_MESSAGES } from "./users.constants";
import { createUserSchema, updateUserSchema } from "./users.schemas";

/**
 * Admin user-management API (A2b) - the V1 substitute for SSO. Admin-only (fail-closed).
 * Creates and manages email-provisioned OTP users, roles, and validated scope.
 */
@ApiTags("admin-users")
@Controller("api/admin/users")
@UseGuards(AuthGuard, AdminGuard)
export class UsersController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly rbac: RbacService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List admin-manageable users" })
  @ApiResponse({ status: HttpStatus.OK, description: USERS_API_DESCRIPTIONS.usersListed })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: USERS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: USERS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  async list(): Promise<AdminUserView[]> {
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users);
    const roleRows = await this.db.select().from(userRoles);
    const scopeRows = await this.db.select().from(userScope);

    return userRows.map((user) => adminUserView(user, roleRows, scopeRows));
  }

  @Post()
  @ApiOperation({ summary: "Create an email-provisioned OTP user" })
  @ApiBody(zodApiBody(createUserSchema))
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: USERS_API_DESCRIPTIONS.userCreated,
    schema: { type: "object", properties: { id: { type: "string", example: "user-id" } } },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: USERS_API_DESCRIPTIONS.validationFailureInvalidRoleOrScope,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: USERS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: USERS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: USERS_API_DESCRIPTIONS.duplicateEmail })
  async create(
    @Body() body: CreateUserBody,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ id: string }> {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const { email, display_name: displayName, roles, scope } = parsed.data;

    await this.validateScope(scope);

    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({ email: email.trim().toLowerCase(), displayName, isActive: true })
          .returning({ id: users.id });
        const id = inserted[0].id;
        for (const role of unique(roles)) await tx.insert(userRoles).values({ userId: id, role });
        for (const s of uniqueScope(scope))
          await tx.insert(userScope).values({
            userId: id,
            attribute: s.attribute,
            value: s.value,
          });
        await this.audit.writeAdminEvent({
          actorId: actor.id,
          action: "user.create",
          target: { type: "user", id },
          detail: {
            email: email.trim().toLowerCase(),
            roles: unique(roles),
            scopeCount: uniqueScope(scope).length,
          },
        }, tx);
        return id;
      });
    } catch (e) {
      throw mapUserWriteError(e);
    }
    return { id };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a user's roles, scope, or active status" })
  @ApiParam({ name: "id", description: "User id" })
  @ApiBody(zodApiBody(updateUserSchema))
  @ApiResponse({ status: HttpStatus.OK, description: USERS_API_DESCRIPTIONS.userUpdated })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: USERS_API_DESCRIPTIONS.validationFailureInvalidRoleOrScope,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: USERS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: USERS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: USERS_API_DESCRIPTIONS.userNotFound })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: USERS_API_DESCRIPTIONS.conflictingRoleAssignment,
  })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateUserBody,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdminUserView> {
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const update = parsed.data;

    try {
      await this.db.transaction(async (tx) => {
        const existing = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
        if (existing.length === 0) throw new NotFoundException(USERS_MESSAGES.userNotFound);

        if (update.scope) await this.validateScope(update.scope);

        if (update.is_active !== undefined) {
          await tx.update(users).set({ isActive: update.is_active }).where(eq(users.id, id));
        }
        if (update.roles !== undefined) {
          await tx.delete(userRoles).where(eq(userRoles.userId, id));
          for (const role of unique(update.roles)) {
            await tx.insert(userRoles).values({ userId: id, role });
          }
        }
        if (update.scope !== undefined) {
          await tx.delete(userScope).where(eq(userScope.userId, id));
          for (const s of uniqueScope(update.scope)) {
            await tx.insert(userScope).values({ userId: id, attribute: s.attribute, value: s.value });
          }
        }
        if (update.is_active === false) {
          await this.sessions.deleteAllForUser(id, tx);
        }
        await this.audit.writeAdminEvent({
          actorId: actor.id,
          action: "user.update",
          target: { type: "user", id },
          detail: {
            changedFields: Object.keys(update),
            ...(update.roles === undefined ? {} : { roleCount: unique(update.roles).length }),
            ...(update.scope === undefined ? {} : { scopeCount: uniqueScope(update.scope).length }),
            ...(update.is_active === undefined ? {} : { isActive: update.is_active }),
          },
        }, tx);
      });
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) throw e;
      throw mapUserWriteError(e);
    }

    const view = await this.getUserViewOrThrow(id);
    return view;
  }

  @Post(":id/deactivate")
  @ApiOperation({ summary: "Deactivate a user and revoke their sessions" })
  @ApiParam({ name: "id", description: "User id" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: USERS_API_DESCRIPTIONS.userDeactivatedAndSessionsRevoked,
    schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: USERS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: USERS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: USERS_API_DESCRIPTIONS.userNotFound })
  async deactivate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ ok: true }> {
    try {
      await this.db.transaction(async (tx) => {
        const updated = await tx
          .update(users)
          .set({ isActive: false })
          .where(eq(users.id, id))
          .returning({ id: users.id });
        if (updated.length === 0) throw new NotFoundException(USERS_MESSAGES.userNotFound);

        await this.sessions.deleteAllForUser(id, tx);
        await this.audit.writeAdminEvent({
          actorId: actor.id,
          action: "user.deactivate",
          target: { type: "user", id },
          detail: { isActive: false, sessionsRevoked: true },
        }, tx);
      });
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw mapUserWriteError(e);
    }
    return { ok: true };
  }

  private async getUserViewOrThrow(id: string): Promise<AdminUserView> {
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (userRows.length === 0) throw new NotFoundException(USERS_MESSAGES.userNotFound);

    const roleRows = await this.db.select().from(userRoles).where(eq(userRoles.userId, id));
    const scopeRows = await this.db.select().from(userScope).where(eq(userScope.userId, id));
    return adminUserView(userRows[0], roleRows, scopeRows);
  }

  private async validateScope(scope: ScopeAttr[]): Promise<void> {
    for (const s of scope) {
      const valid = await this.rbac.validateScopeValue(s.attribute, s.value).catch((error: unknown) => {
        if (error instanceof Error && error.message === RBAC_MESSAGES.scopeGoldValidationFailed) {
          throw new BadRequestException(USERS_MESSAGES.scopeGoldValidationFailed);
        }
        throw error;
      });
      if (!valid)
        throw new BadRequestException(
          USERS_MESSAGES.invalidScopeValue(s.attribute, s.value),
        );
    }
  }
}

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
};

type RoleRow = { userId: string; role: string };
type ScopeRow = { userId: string; attribute: string; value: string };

type CreateUserBody = {
  email: string;
  display_name: string;
  roles: string[];
  scope: ScopeAttr[];
};

type UpdateUserBody = {
  roles?: string[];
  scope?: ScopeAttr[];
  is_active?: boolean;
};

interface AdminUserView {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  scope: ScopeAttr[];
  is_active: boolean;
  createdAt: string;
}

function adminUserView(user: UserRow, roles: RoleRow[], scope: ScopeRow[]): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    roles: roles.filter((r) => r.userId === user.id).map((r) => r.role),
    scope: scope
      .filter((s) => s.userId === user.id)
      .map((s) => ({ attribute: s.attribute, value: s.value })),
    is_active: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueScope(scope: ScopeAttr[]): ScopeAttr[] {
  const seen = new Set<string>();
  return scope.filter((s) => {
    const key = `${s.attribute}\u0000${s.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapUserWriteError(
  error: unknown,
): BadRequestException | ConflictException | InternalServerErrorException {
  const code = pgErrorCode(error);
  if (code === "23505") return new ConflictException(USERS_MESSAGES.emailAlreadyExists);
  if (code === "23503") return new BadRequestException(USERS_MESSAGES.roleDoesNotExist);
  return new InternalServerErrorException(USERS_MESSAGES.internalError);
}

function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const maybe = current as { code?: unknown; cause?: unknown };
    if (typeof maybe.code === "string") return maybe.code;
    current = maybe.cause;
  }
  return undefined;
}
