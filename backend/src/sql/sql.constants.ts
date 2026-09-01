export const SQL_BUILDER_MESSAGES = {
  missingScopeForScopedDomain:
    "row-scoped domain requires at least one matching user scope value",
  invalidTimeWindowColumn: (column: string): string =>
    `time-window column is not a domain dimension column: ${column}`,
} as const;

export const SQL_VALIDATOR_MESSAGES = {
  blockedColumn: (column: string): string => `blocked column: ${column}`,
} as const;
