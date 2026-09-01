export const GRANT_TYPES = ["domain", "measure", "dimension", "action"] as const;

export const GRANT_ACTIONS = ["admin", "save", "pin"] as const;

export const GRANTS_MESSAGES = {
  roleDoesNotExist: (role: string): string => `role ${role} does not exist`,
  invalidGrantType: "grantType must be one of domain, measure, dimension, action",
  invalidDomainGrant: (grantId: string): string => `domain grantId ${grantId} is not registered`,
  invalidMeasureGrant: (grantId: string): string => `measure grantId ${grantId} is not registered`,
  invalidDimensionGrant: (grantId: string): string => `dimension grantId ${grantId} is not registered`,
  invalidActionGrant: (grantId: string): string => `action grantId ${grantId} is not allowed`,
} as const;

export const GRANTS_API_DESCRIPTIONS = {
  grantsListed: "Role grants listed.",
  grantCreated: "Role grant created or already existed.",
  grantDeleted: "Role grant deleted if it existed.",
  validationFailureInvalidRoleOrGrant: "Validation failure, invalid role, or invalid grant.",
  unauthenticatedRequest: "Unauthenticated request.",
  authenticatedUserIsNotAdmin: "Authenticated user is not an admin.",
} as const;
