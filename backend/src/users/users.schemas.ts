import { z } from "zod";
import { USERS_VALIDATION } from "./users.constants";

export const scopeAttrSchema = z.object({ attribute: z.string(), value: z.string() });

export const createUserSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(USERS_VALIDATION.displayNameMinLength),
  roles: z.array(z.string()).min(USERS_VALIDATION.minRoles),
  scope: z.array(scopeAttrSchema).default([]),
});

export const updateUserSchema = z
  .object({
    roles: z.array(z.string()).min(USERS_VALIDATION.minRoles).optional(),
    scope: z.array(scopeAttrSchema).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
