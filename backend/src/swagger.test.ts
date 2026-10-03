import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod, type INestApplication } from "@nestjs/common";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { ResponseClass, type AskResponse, type ChatStreamEvent } from "@3f/contract";
import { AppModule } from "./app.module";
import { AuthController } from "./auth/auth.controller";
import { ChatController } from "./chat/chat.controller";
import { AskDrillController } from "./chat/ask-drill.controller";
import { ChatResponseDto, ChatStreamEventDto } from "./chat/chat.schemas";
import { AuthoredMeasureRegistry } from "./measures/authored-measure.registry";
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
    ...controllerRoutes(AskDrillController),
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
    "POST /api/chat/drill",
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
    rowLabels: [],
    drill: { context: "signed", rows: [] },
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
    appliedMeasureFilters: [],
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
  const appliedMeasureFiltersProperty = Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    ChatResponseDto.prototype,
    "appliedMeasureFilters",
  ) as {
    items: {
      required: string[];
      properties: {
        measureId: { type: string };
        op: { enum: string[] };
        compareTo: { oneOf: Array<{ required: string[] }> };
      };
    };
  };
  assert.deepEqual(appliedMeasureFiltersProperty.items.required, ["measureId", "op", "compareTo"]);
  assert.equal(appliedMeasureFiltersProperty.items.properties.measureId.type, "string");
  assert.deepEqual(appliedMeasureFiltersProperty.items.properties.op.enum, ["gt", "gte", "lt", "lte"]);
  assert.deepEqual(
    appliedMeasureFiltersProperty.items.properties.compareTo.oneOf.map(({ required }) => required),
    [
      ["kind", "measureId"],
      ["kind", "value"],
    ],
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

test("POST /api/chat/drill documents its bounded request and typed transaction response", async () => {
  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    const operation = document.paths["/api/chat/drill"]?.post;
    assert.ok(operation);
    assert.deepEqual(Object.keys(operation.responses).sort(), ["200", "400", "403", "409", "410", "503"]);
    const requestRef = (
      operation.requestBody as {
        content?: { "application/json"?: { schema?: { $ref?: string } } };
      }
    ).content?.["application/json"]?.schema?.$ref;
    const responseRef = (
      operation.responses["200"] as {
        content?: { "application/json"?: { schema?: { $ref?: string } } };
      }
    ).content?.["application/json"]?.schema?.$ref;
    assert.equal(requestRef, "#/components/schemas/AskDrillRequestDto");
    assert.equal(responseRef, "#/components/schemas/AskDrillResponseDto");
    const request = document.components?.schemas?.AskDrillRequestDto as {
      required?: string[];
      properties?: { page?: { minimum?: number; maximum?: number } };
    };
    assert.deepEqual(request.required?.sort(), ["context", "page", "rowKey"]);
    assert.deepEqual(request.properties?.page, { type: "number", minimum: 1, maximum: 1_000_000, example: 1 });
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

test("POST /api/chat documents selection measure filters through the shared selection schema", async () => {
  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    const responseSchema = document.paths["/api/chat"]?.post?.responses?.["201"] as {
      content?: { "application/json"?: { schema?: { $ref?: string } } };
    };
    const responseRef = responseSchema.content?.["application/json"]?.schema?.$ref;
    assert.equal(responseRef, "#/components/schemas/ChatResponseDto");

    const responseComponent = document.components?.schemas?.ChatResponseDto as {
      properties?: { selection?: { $ref?: string } };
    };
    assert.equal(responseComponent.properties?.selection?.$ref, "#/components/schemas/ExplorationSelectionDto");

    const selectionComponent = document.components?.schemas?.ExplorationSelectionDto as {
      properties?: Record<string, unknown>;
    };
    assert.ok(selectionComponent.properties?.measureFilters);
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
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
