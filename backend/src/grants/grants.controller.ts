import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "@3f/contract";
import { eq, and } from "drizzle-orm";
import { DRIZZLE_DB } from "../config";
import { zodApiBody } from "../common/openapi";
import type { AppDb } from "../db/pool";
import { rolePerms, roles } from "../db/schema";
import { AuthGuard, AdminGuard, CurrentUser } from "../auth/auth.guard";
import { AuditService } from "../core/audit.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { GRANT_ACTIONS, GRANTS_API_DESCRIPTIONS, GRANTS_MESSAGES } from "./grants.constants";
import { grantSchema } from "./grants.schemas";

type GrantView = {
  role: string;
  grantType: string;
  grantId: string;
};

/**
 * Admin role-grant API (B1). Validates grants against application roles and the semantic layer.
 */
@ApiTags("admin-grants")
@Controller("api/admin/grants")
@UseGuards(AuthGuard, AdminGuard)
export class GrantsController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List role grants" })
  @ApiQuery({ name: "role", required: false, description: "Optional role-name filter" })
  @ApiResponse({ status: HttpStatus.OK, description: GRANTS_API_DESCRIPTIONS.grantsListed })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: GRANTS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: GRANTS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  async list(@Query("role") role?: string): Promise<GrantView[]> {
    const query = this.db.select().from(rolePerms);
    const rows = role ? await query.where(eq(rolePerms.role, role)) : await query;
    return rows.map((row) => ({
      role: row.role,
      grantType: row.grantType,
      grantId: row.grantId,
    }));
  }

  @Post()
  @ApiOperation({ summary: "Create a role grant idempotently" })
  @ApiBody(zodApiBody(grantSchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: GRANTS_API_DESCRIPTIONS.grantCreated })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: GRANTS_API_DESCRIPTIONS.validationFailureInvalidRoleOrGrant,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: GRANTS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: GRANTS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ): Promise<GrantView> {
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const grant = parsed.data;

    await this.validateGrant(grant.role, grant.grantType, grant.grantId);
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(rolePerms)
        .values(grant)
        .onConflictDoNothing()
        .returning({ role: rolePerms.role });
      if (inserted.length === 0) return;

      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "grant.add",
        target: { type: "grant", ...grant },
        detail: { operation: "add" },
      }, tx);
    });
    return grant;
  }

  @Delete()
  @ApiOperation({ summary: "Delete a role grant idempotently" })
  @ApiBody(zodApiBody(grantSchema))
  @ApiResponse({ status: HttpStatus.OK, description: GRANTS_API_DESCRIPTIONS.grantDeleted })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: GRANTS_API_DESCRIPTIONS.validationFailureInvalidRoleOrGrant,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: GRANTS_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: GRANTS_API_DESCRIPTIONS.authenticatedUserIsNotAdmin,
  })
  async delete(
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ ok: true }> {
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const grant = parsed.data;

    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(rolePerms)
        .where(
          and(
            eq(rolePerms.role, grant.role),
            eq(rolePerms.grantType, grant.grantType),
            eq(rolePerms.grantId, grant.grantId),
          ),
        )
        .returning({ role: rolePerms.role });
      if (deleted.length === 0) return;

      await this.audit.writeAdminEvent({
        actorId: actor.id,
        action: "grant.remove",
        target: { type: "grant", ...grant },
        detail: { operation: "remove" },
      }, tx);
    });
    return { ok: true };
  }

  private async validateGrant(
    role: string,
    grantType: "domain" | "measure" | "dimension" | "action",
    grantId: string,
  ): Promise<void> {
    const roleRows = await this.db.select({ name: roles.name }).from(roles).where(eq(roles.name, role)).limit(1);
    if (roleRows.length === 0) throw new BadRequestException(GRANTS_MESSAGES.roleDoesNotExist(role));

    if (grantType === "domain" && !this.semantic.domain(grantId)) {
      throw new BadRequestException(GRANTS_MESSAGES.invalidDomainGrant(grantId));
    }
    if (grantType === "measure" && !this.semantic.all().some((domain) => domain.measures.some((m) => m.id === grantId))) {
      throw new BadRequestException(GRANTS_MESSAGES.invalidMeasureGrant(grantId));
    }
    if (
      grantType === "dimension" &&
      !this.semantic.all().some((domain) => domain.dimensions.some((dimension) => dimension.id === grantId))
    ) {
      throw new BadRequestException(GRANTS_MESSAGES.invalidDimensionGrant(grantId));
    }
    if (grantType === "action" && !(GRANT_ACTIONS as readonly string[]).includes(grantId)) {
      throw new BadRequestException(GRANTS_MESSAGES.invalidActionGrant(grantId));
    }
  }
}
