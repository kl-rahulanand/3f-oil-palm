export const LLM_CONTEXT_TOKEN_BUDGET = 2_000;
export const LLM_CONTEXT_CHARS_PER_TOKEN = 4;
export const LLM_CONTEXT_CHAR_BUDGET =
  LLM_CONTEXT_TOKEN_BUDGET * LLM_CONTEXT_CHARS_PER_TOKEN;

export const LLM_MESSAGES = {
  emitSelectionDescription: "Emit a verified 3F semantic-layer selection. Do not include SQL.",
  requestClarificationDescription:
    "Ask the user to clarify when multiple valid semantic selections are possible.",
  markUnsupportedDescription:
    "Mark the question unsupported when it cannot be answered from the allowed vocabulary.",
  noToolUse: "Bedrock response did not include a tool use",
  malformedClarificationToolResponse: "Malformed clarification tool response",
  questionUnsupported: "Question is unsupported",
  unsupportedBedrockTool: (name: string): string => `Unsupported Bedrock tool: ${name}`,
  malformedSelectionToolResponse: "Malformed selection tool response",
  selectionDomainNotAllowed: "Selection domain is not in the allowed vocabulary",
  selectionMissingMeasureIds: "Selection is missing measureIds",
  selectionMeasureNotAllowed: (id: string): string =>
    `Selection measure is not in the allowed vocabulary: ${id}`,
  selectionDimensionIdsMalformed: "Selection dimensionIds are malformed",
  selectionDimensionNotAllowed: (id: string): string =>
    `Selection dimension is not in the allowed vocabulary: ${id}`,
  selectionFiltersMalformed: "Selection filters are malformed",
  selectionFilterDimensionNotAllowed: (id: string): string =>
    `Selection filter dimension is not in the allowed vocabulary: ${id}`,
  selectionTimeWindowMalformed: "Selection timeWindow is malformed",
  selectionLimitMalformed: "Selection limit is malformed",
  bedrockModelIdNotConfigured:
    "Bedrock select failed: BEDROCK_MODEL_ID is not configured",
  bedrockSelectFailed: (message: string): string => `Bedrock select failed: ${message}`,
  systemPromptBank: "3F selects verified metrics from configured data domains.",
  systemPromptToday: (dateIso: string): string =>
    `Today's date is ${dateIso} (UTC). Interpret relative/named dates against it.`,
  systemPromptVocabulary:
    "You must select only from the provided semantic-layer domain, measure, and dimension ids.",
  systemPromptDimensionsOnly:
    "Include in dimensionIds ONLY the dimensions the user explicitly asks to break the metric down by (i.e. the 'by X' in the question). If the user asks for a single total with no breakdown, return an empty dimensionIds array.",
  systemPromptAnswerTotals:
    "When the user clearly asks for a metric -- e.g. 'how many X', 'count of X', 'total X', 'number of X', or just 'X' where X is a known measure -- you MUST call emit_selection for that metric as a TOTAL with an EMPTY dimensionIds array. Do NOT call request_clarification to ask how to break it down; a breakdown is optional and the user can request one in a follow-up. Only ask for clarification when the message is genuinely not a specific metric request (greeting, small talk, meta/help question) or is truly ambiguous about which single measure is meant.",
  systemPromptMultiMeasure:
    "If the user names SEVERAL metrics in one message (e.g. 'fresh, rpush and the conversion rate', 'total leads and appointments booked', 'conversion rate and unassigned leads by state'), include ALL of the requested measures in measureIds -- measureIds is a LIST and may contain multiple ids. Naming multiple known metrics is NOT ambiguity: only call request_clarification when you cannot tell WHICH single measure the user means. Do not silently drop any requested metric.",
  systemPromptNoDateUnlessAsked:
    "Do NOT add a date or time dimension unless the question explicitly refers to time -- e.g. 'over time', 'trend', 'by day/week/month', 'daily', 'monthly'. Example: 'lead count by state' -> dimensionIds ['state'] ONLY (do not add date).",
  systemPromptNoSql: "Never write SQL. Never invent measures, dimensions, filters, or columns.",
  systemPromptFilterValues:
    "For any enumerated dimension values listed below, filter values must use EXACTLY one of the provided real values, including casing.",
  systemPromptUnsupported:
    "If the question needs something outside this vocabulary, call request_clarification or mark_unsupported.",
  systemPromptConversational:
    "Call emit_selection ONLY when the user is clearly requesting configured data (a specific metric or a breakdown of one). " +
    "If the message is a greeting, small talk, thanks, or a meta/help question about what you can do or your vocabulary, or is otherwise NOT a request for a specific metric, you MUST call request_clarification (never emit_selection). " +
    "In that clarification, give a short friendly prompt saying you answer questions from configured data domains, and set options to 2-3 concrete example questions drawn from the allowed vocabulary. " +
    "NEVER default to a measure for a message that is not a genuine data request.",
  allowedDimensionValues: (dimensionValues: Record<string, string[]>): string =>
    Object.entries(dimensionValues)
      .map(
        ([dimensionId, values]) =>
          `Allowed values for ${dimensionId}: [${values.map((value) => JSON.stringify(value)).join(", ")}]. When filtering on ${dimensionId}, use EXACTLY one of these values.`,
      )
      .join("\n"),
  allowedVocabularyJson: (json: string, conversationContext: string): string =>
    `Allowed vocabulary JSON: ${json}${conversationContext}`,
  conversationContext: (priorTurnsJson: string): string =>
    [
      "",
      "The user is in an ongoing conversation.",
      `Recent turns JSON (oldest first, latest last): ${priorTurnsJson}.`,
      "If the new question is a FOLLOW-UP that refines the conversation (e.g. 'break it down by state', 'now only serviceable', 'what about by channel', 'and by bank too'), START from the most relevant recent selection and apply the change -- add/remove a dimension, add/change a filter, or change the measure -- keeping the rest.",
      "If the new question is a NEW topic, ignore the recent turns.",
      "Always return a full valid selection constrained to the allowed vocabulary.",
    ].join("\n"),
} as const;
