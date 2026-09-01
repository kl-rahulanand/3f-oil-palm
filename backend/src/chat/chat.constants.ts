export const CHAT_VALIDATION = {
  questionMinLength: 1,
  conversationIdMaxLength: 200,
} as const;

export const CHAT_MESSAGES = {
  noAccessibleDomains: "You don't have access to any data domains.",
  unknownOrNotPermittedDomain: "Unknown or not-permitted domain.",
  noDataScopeAssigned: "No data scope assigned for your account.",
  invalidDateRange: "Invalid date range: the start date is after the end date.",
  reportGroundingSelectionMismatch: "That question cannot be answered within this report's fields.",
  auditNotRecorded: "Could not record audit; query not run.",
  measureNotAvailable: (measureId: string): string => `Measure not available: ${measureId}`,
  dimensionNotAvailable: (dimensionId: string): string =>
    `Dimension not available: ${dimensionId}`,
  queryBlocked: (reason: string | undefined): string => `Query blocked: ${reason}`,
} as const;

export const CHAT_API_DESCRIPTIONS = {
  answerGenerated: "Answer generated for the authenticated user.",
  invalidRequestBody: "Invalid request body.",
  unauthenticatedRequest: "Unauthenticated request.",
  passwordResetRequired: "Password reset required.",
} as const;
