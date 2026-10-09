import assert from "node:assert/strict";
import { test } from "node:test";

import { financialChatErrorDetailsSchema } from "@3f/contract";

import { loadConfig } from "../config";

const FINANCIAL_CHAT_ENV = [
  "FINANCIAL_CHAT_ENABLED",
  "FINANCIAL_CHAT_MODEL_PROVIDER",
  "FINANCIAL_CHAT_MODEL_ID",
  "ANTHROPIC_API_KEY",
  "FINANCIAL_CHAT_MODEL_MAX_RETRIES",
  "FINANCIAL_CHAT_MODEL_TIMEOUT_MS",
] as const;

test("disabled Financial Chat starts without model settings and returns a typed feature refusal", () => {
  withFinancialChatEnv({}, () => {
    const config = loadConfig();

    assert.equal(config.financialChat.enabled, false);
    assert.equal(config.financialChat.model, null);
    assert.deepEqual(financialChatErrorDetailsSchema.parse(config.financialChat.requestRefusal), {
      reason: "feature_disabled",
    });
  });
});

test("enabled Financial Chat starts with missing or invalid model settings and returns a typed model refusal", () => {
  const invalidSettings: Array<Record<string, string>> = [
    {},
    validSettings({ FINANCIAL_CHAT_MODEL_PROVIDER: "openai" }),
    validSettings({ FINANCIAL_CHAT_MODEL_ID: "claude-unknown" }),
    validSettings({ ANTHROPIC_API_KEY: "   " }),
    validSettings({ FINANCIAL_CHAT_MODEL_MAX_RETRIES: "unbounded" }),
    validSettings({ FINANCIAL_CHAT_MODEL_MAX_RETRIES: "4" }),
    validSettings({ FINANCIAL_CHAT_MODEL_TIMEOUT_MS: "0" }),
    validSettings({ FINANCIAL_CHAT_MODEL_TIMEOUT_MS: "120001" }),
  ];

  for (const settings of invalidSettings) {
    withFinancialChatEnv({ FINANCIAL_CHAT_ENABLED: "true", ...settings }, () => {
      const config = loadConfig();

      assert.equal(config.financialChat.enabled, true);
      assert.equal(config.financialChat.model, null);
      assert.deepEqual(financialChatErrorDetailsSchema.parse(config.financialChat.requestRefusal), {
        reason: "model_unavailable",
      });
    });
  }
});

test("valid Financial Chat settings are bounded without changing the existing Ask provider", () => {
  withFinancialChatEnv(
    {
      ...validSettings(),
      FINANCIAL_CHAT_ENABLED: "1",
      LLM_PROVIDER: "bedrock",
      AWS_REGION: "ap-south-1",
      BEDROCK_MODEL_ID: "existing-ask-model",
    },
    () => {
      const config = loadConfig();

      assert.deepEqual(config.financialChat, {
        enabled: true,
        model: {
          provider: "anthropic",
          modelId: "claude-sonnet-5-5",
          apiKey: "test-only-anthropic-key",
          maxRetries: 2,
          timeoutMs: 30_000,
        },
        requestRefusal: null,
      });
      assert.equal(config.llmProvider, "bedrock");
      assert.deepEqual(config.bedrock, { region: "ap-south-1", modelId: "existing-ask-model" });
    },
  );
});

function validSettings(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    FINANCIAL_CHAT_MODEL_PROVIDER: "anthropic",
    FINANCIAL_CHAT_MODEL_ID: "claude-sonnet-5-5",
    ANTHROPIC_API_KEY: "test-only-anthropic-key",
    FINANCIAL_CHAT_MODEL_MAX_RETRIES: "2",
    FINANCIAL_CHAT_MODEL_TIMEOUT_MS: "30000",
    ...overrides,
  };
}

function withFinancialChatEnv(values: Record<string, string>, run: () => void): void {
  const environment = { ...process.env };
  try {
    for (const name of FINANCIAL_CHAT_ENV) delete process.env[name];
    Object.assign(process.env, values);
    run();
  } finally {
    process.env = environment;
  }
}
