import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { ResponseClass, type AskResponse, type ChatStreamEvent } from "@3f/contract";
import { AuthController } from "./auth/auth.controller";
import { ChatController } from "./chat/chat.controller";
import { ChatResponseDto, ChatStreamEventDto } from "./chat/chat.schemas";
import { UsersController } from "./users/users.controller";
import { GrantsController } from "./grants/grants.controller";
import { ReportsController } from "./reports/reports.controller";
import { PinsController } from "./pins/pins.controller";
import { SavedController } from "./saved/saved.controller";
import { buildSwaggerConfig } from "./main";

test("controller metadata contains auth, admin, and data API paths without bearer security", () => {
  const paths = [
    ...controllerRoutes(AuthController),
    ...controllerRoutes(ChatController),
    ...controllerRoutes(UsersController),
    ...controllerRoutes(GrantsController),
    ...controllerRoutes(ReportsController),
    ...controllerRoutes(PinsController),
    ...controllerRoutes(SavedController),
  ];

  for (const expected of [
    "POST /api/auth/otp/request",
    "POST /api/auth/otp/verify",
    "GET /api/auth/csrf",
    "GET /api/auth/me",
    "POST /api/auth/refresh",
    "POST /api/auth/logout",
    "POST /api/chat",
    "GET /api/admin/users",
    "POST /api/admin/users",
    "PATCH /api/admin/users/:id",
    "POST /api/admin/users/:id/deactivate",
    "GET /api/admin/grants",
    "POST /api/admin/grants",
    "GET /api/reports",
    "POST /api/reports/:id/run",
    "POST /api/saved",
    "GET /api/saved",
    "DELETE /api/saved/:id",
    "POST /api/pins",
    "GET /api/pins",
    "PATCH /api/pins/reorder",
    "PATCH /api/pins/:id/view",
    "DELETE /api/pins/:id",
  ]) {
    assert.ok(paths.includes(expected), `missing ${expected}`);
  }

  const swagger = buildSwaggerConfig();
  assert.equal(swagger.info.title, "3F API");
  assert.equal(swagger.components?.securitySchemes?.bearer, undefined);
});

test("both chat routes document the explanation union with a named schema", () => {
  assert.equal(ChatResponseDto.name, "ChatResponseDto");
  assert.equal(ChatStreamEventDto.name, "ChatStreamEventDto");
  for (const [route, expected] of [
    [ChatController.prototype.ask, ChatResponseDto],
    [ChatController.prototype.stream, ChatStreamEventDto],
  ] as const) {
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, route) as Record<string, { type?: Function }>;
    const response = responses[route === ChatController.prototype.ask ? "201" : "200"];
    assert.equal(response?.type, expected);
  }

  const responseFields = modelProperties(ChatResponseDto);
  const completeResponse = {
    responseClass: ResponseClass.Success,
    sessionId: "session",
    kind: "informational",
    term: "Actual",
    definitionKind: "measure",
    definition: "Actual spend",
    suggestedQuestions: [],
    usedPriorContext: false,
    title: "Actual by GL",
    chips: [],
    selection: { domain: "test", measureIds: [], dimensionIds: [], filters: [] },
    result: { columns: [], rows: [] },
    totals: {},
    chartType: "table",
    availableChartTypes: ["table"],
    availableFields: { dimensions: [], measures: [] },
    provenance: {
      verified: true,
      measureIds: [],
      measures: [],
      impliedFilters: [],
      scope: "plant=DUB",
      readback: "Actual",
      dataAsOf: null,
      sql: "select 1",
    },
    appliedTimeWindow: { from: "2026-07-01", to: "2026-07-01", column: "month" },
    appliedFilters: [],
    periodChoice: {
      prompt: "Pick",
      selection: { domain: "test", measureIds: [], dimensionIds: [], filters: [] },
      question: "Actual?",
      options: [],
    },
    periodControl: { current: null, options: [] },
    statementGrounding: { outcome: "focus-required" },
    viewInReport: { available: false, reason: "Not a statement answer" },
    message: "Done",
    clarify: { prompt: "Pick", options: [] },
    latencyMs: 1,
  } satisfies Required<AskResponse>;
  assert.deepEqual(
    Object.keys(completeResponse).filter((field) => !responseFields.includes(field)),
    [],
  );
  const groundingProperty = Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    ChatResponseDto.prototype,
    "statementGrounding",
  ) as { oneOf: Array<{ required: string[]; properties: { outcome: { enum: string[] } } }> };
  assert.deepEqual(
    Object.fromEntries(groundingProperty.oneOf.map((schema) => [schema.properties.outcome.enum[0], schema.required])),
    {
      "focus-required": ["outcome"],
      leaf: ["outcome", "nodeKey", "leafKey", "block", "budgetState", "transactions", "rollup"],
      replaced: [
        "outcome",
        "nodeKey",
        "leafKey",
        "block",
        "budgetState",
        "transactions",
        "rollup",
        "notice",
        "replacedBatches",
      ],
      aggregate: ["outcome", "nodeKey", "block", "budgetState", "instruction"],
      gone: ["outcome", "batchStatuses", "message"],
      "audit-failure": ["outcome", "message"],
      refused: ["outcome", "reason"],
    },
  );

  const streamFields = modelProperties(ChatStreamEventDto);
  const streamEvents = [
    { type: "phase", phase: "routing" },
    { type: "token", text: "Working" },
    { type: "result", response: completeResponse },
    { type: "error", message: "Failed", responseClass: ResponseClass.BackendError },
  ] satisfies ChatStreamEvent[];
  assert.deepEqual(
    [...new Set(streamEvents.flatMap((event) => Object.keys(event)))].filter((field) => !streamFields.includes(field)),
    [],
  );
});

function modelProperties(model: Function): string[] {
  return (
    (Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, model.prototype) as string[] | undefined) ?? []
  ).map((property) => property.replace(/^:/, ""));
}

function controllerRoutes(controller: Function): string[] {
  const prefix = normalizePath(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== "constructor")
    .flatMap((name) => {
      const handler = controller.prototype[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || path === undefined) return [];
      const methodName = RequestMethod[method];
      return (Array.isArray(path) ? path : [path]).map(
        (route) => `${methodName} ${joinPaths(prefix, normalizePath(route))}`,
      );
    });
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function joinPaths(prefix: string, path: string): string {
  return `/${[prefix, path].filter(Boolean).join("/")}`;
}
