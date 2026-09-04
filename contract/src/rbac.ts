// Gate 0 - RBAC types (five-layer model; app-managed, admin-provisioned, no IdP in V1).

import { z } from "zod";

export const permissionsSchema = z
  .object({
    /** Domains the user may query. */
    domains: z.array(z.string()),
    /** Domain-qualified measure ids the user may use. */
    measureIds: z.array(z.string()),
    /** Dimension ids the user may slice by. */
    dimensionIds: z.array(z.string()),
    /** Action-level grants, e.g. "pin", "save", "admin". */
    actions: z.array(z.string()),
  })
  .strict();

export const scopeAttrSchema = z
  .object({
    /** e.g. "region_code" - the gold column the predicate is injected on. */
    attribute: z.string(),
    /** e.g. "NZ" - validated to be a real value in the gold object. */
    value: z.string(),
  })
  .strict();

export const authUserSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    display_name: z.string(),
    is_active: z.boolean(),
    roles: z.array(z.string()),
    /** Resolved permissions (union across roles). */
    permissions: permissionsSchema,
    /** Row-level scope, admin-set and validated against real gold values. */
    scope: z.array(scopeAttrSchema),
  })
  .strict();

export type AuthUser = z.infer<typeof authUserSchema>;
export type Permissions = z.infer<typeof permissionsSchema>;
export type ScopeAttr = z.infer<typeof scopeAttrSchema>;

export type GrantType = "domain" | "measure" | "dimension" | "action";

/** POST/DELETE /api/admin/grants. */
export interface GrantRequest {
  role: string;
  grantType: GrantType;
  grantId: string;
}

/** Admin-facing role grant returned by /api/admin/grants. */
export interface GrantView extends GrantRequest {}
