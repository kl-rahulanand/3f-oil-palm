export const USERS_VALIDATION = {
  displayNameMinLength: 1,
  minRoles: 1,
} as const;

export const USERS_MESSAGES = {
  emailAlreadyExists: "email already exists",
  roleDoesNotExist: "role does not exist",
  userNotFound: "user not found",
  scopeGoldValidationFailed: "could not validate scope value against gold data",
  internalError: "could not complete user operation",
  invalidScopeValue: (attr: string, val: string): string =>
    `scope value ${attr}=${val} is not a valid gold value`,
} as const;

export const USERS_API_DESCRIPTIONS = {
  usersListed: "Users listed.",
  unauthenticatedRequest: "Unauthenticated request.",
  authenticatedUserIsNotAdmin: "Authenticated user is not an admin.",
  userCreated: "User created.",
  validationFailureInvalidRoleOrScope:
    "Validation failure, invalid role, or invalid scope value.",
  duplicateEmail: "Duplicate email.",
  userUpdated: "User updated.",
  userNotFound: "User not found.",
  conflictingRoleAssignment: "Conflicting role assignment.",
  userDeactivatedAndSessionsRevoked: "User deactivated and sessions revoked.",
} as const;
