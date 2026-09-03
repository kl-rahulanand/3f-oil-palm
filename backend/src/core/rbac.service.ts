import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import type { AuthUser, Permissions, ScopeAttr } from "@3f/contract";
import { DRIZZLE_DB, WAREHOUSE, loadConfig } from "../config";
import type { AppDb } from "../db/pool";
import { rolePerms, userRoles, userScope, users } from "../db/schema";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SemanticLayer } from "../semantic/semanticLayer";

export const RBAC_MESSAGES = {
  scopeGoldValidationFailed: "could not validate scope value against gold data",
} as const;

type DistinctValuesCacheEntry = {
  values: string[];
  expiresAt: number;
};

/**
 * Resolves a user's permissions + row-level scope. Source of truth = application Postgres
 * (admin-provisioned; no IdP sync in V1). Fail-closed: callers treat a throw / null
 * as "deny".
 */
@Injectable()
export class RbacService {
  private readonly scopeValueCacheTtlMs = loadConfig().scopeValueCacheTtlMs;
  private readonly distinctValuesCache = new Map<string, DistinctValuesCacheEntry>();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    private readonly semantic: SemanticLayer,
  ) {}

  async resolveUser(userId: string): Promise<AuthUser | null> {
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (userRows.length === 0 || !userRows[0].isActive) return null;

    const roles = (
      await this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
    ).map((r) => r.role);

    const perms = await this.resolvePermissions(roles);

    const scope: ScopeAttr[] = (
      await this.db
        .select({ attribute: userScope.attribute, value: userScope.value })
        .from(userScope)
        .where(eq(userScope.userId, userId))
    ).map((s) => ({ attribute: s.attribute, value: s.value }));

    return {
      id: userRows[0].id,
      email: userRows[0].email,
      display_name: userRows[0].displayName,
      is_active: userRows[0].isActive,
      roles,
      permissions: perms,
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
    const pick = (t: string) => rows.filter((r) => r.grantType === t).map((r) => r.grantId);
    return {
      domains: [...new Set(pick("domain"))],
      measureIds: [...new Set(pick("measure"))],
      dimensionIds: [...new Set(pick("dimension"))],
      actions: [...new Set(pick("action"))],
    };
  }

  /** Guard against wrong-but-valid scope: the attribute and gold column are semantic-owned. */
  async validateScopeValue(attribute: string, value: string): Promise<boolean> {
    const resolved = this.resolveScopeAttribute(attribute);
    if (!resolved) return false;

    const values = await this.distinctValuesFor(resolved.goldObject, resolved.column);
    return values.includes(value);
  }

  private resolveScopeAttribute(attribute: string): { goldObject: string; column: string } | null {
    for (const domain of this.semantic.all()) {
      const dimension = domain.dimensions.find((d) => d.id === attribute);
      if (dimension) return { goldObject: domain.goldObject, column: dimension.column };
      if (domain.scopeColumn === attribute) {
        return { goldObject: domain.goldObject, column: domain.scopeColumn };
      }
    }
    return null;
  }

  private async distinctValuesFor(goldObject: string, column: string): Promise<string[]> {
    const cacheKey = `${goldObject}\u0000${column}`;
    const now = Date.now();
    const cached = this.distinctValuesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.values;

    try {
      const values = await this.warehouse.distinctValues(goldObject, column);
      this.distinctValuesCache.set(cacheKey, {
        values,
        expiresAt: now + this.scopeValueCacheTtlMs,
      });
      return values;
    } catch (error) {
      throw new Error(RBAC_MESSAGES.scopeGoldValidationFailed, { cause: error });
    }
  }
}
