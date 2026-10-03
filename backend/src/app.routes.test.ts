import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException, type ExecutionContext, type INestApplication } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { AuthUser } from "@3f/contract";
import { AppModule } from "./app.module";
import { type AuthedRequest, AuthGuard } from "./auth/auth.guard";
import { ChatController } from "./chat/chat.controller";
import { FreshnessController } from "./warehouse/freshness.controller";
import { FreshnessErrorDto, FreshnessResponseDto } from "./warehouse/freshness.dto";
import { AuthoredMeasureRegistry } from "./measures/authored-measure.registry";
import { buildSwaggerConfig, configureApp } from "./main";
import { PinsController } from "./pins/pins.controller";
import { SavedController } from "./saved/saved.controller";

test("the freshness route is allow listed behind auth guard with no action grant and documents its typed responses", async () => {
  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    assert.deepEqual(registeredRoutes(app), [
      "DELETE /api/pins/:id",
      "DELETE /api/saved/:id",
      "GET /api/auth/csrf",
      "GET /api/auth/me",
      "GET /api/mis/options",
      "GET /api/pins",
      "GET /api/saved",
      "GET /api/warehouse/freshness",
      "GET /health",
      "PATCH /api/pins/:id/view",
      "PATCH /api/pins/reorder",
      "POST /api/auth/logout",
      "POST /api/auth/otp/request",
      "POST /api/auth/otp/verify",
      "POST /api/auth/refresh",
      "POST /api/chat",
      "POST /api/chat/drill",
      "POST /api/chat/stream",
      "POST /api/ingest/actuals",
      "POST /api/ingest/budget",
      "POST /api/mis/run",
      "POST /api/mis/statement",
      "POST /api/mis/statement/drill",
      "POST /api/mis/statement/export",
      "POST /api/pins",
      "POST /api/saved",
    ]);
    const routes = registeredRoutes(app);
    assert.equal(
      routes.some((route) => route.includes("/api/help")),
      false,
    );
    assert.equal(
      routes.some((route) => route.includes("/api/conversations")),
      false,
    );
    assert.equal(
      routes.some((route) => route.startsWith("POST /api/pins/") && route.includes("refresh")),
      false,
    );

    assertActionGuard(ChatController, "report");
    assertActionGuard(SavedController, "save");
    assertActionGuard(PinsController, "pin");

    const freshnessGuards = Reflect.getMetadata(GUARDS_METADATA, FreshnessController) as Function[];
    assert.deepEqual(freshnessGuards, [AuthGuard]);
    assert.equal(Reflect.getMetadata(GUARDS_METADATA, FreshnessController.prototype.freshness), undefined);

    const swagger = SwaggerModule.createDocument(app, buildSwaggerConfig());
    const freshnessResponses = swagger.paths["/api/warehouse/freshness"]?.get?.responses;
    assert.equal(responseSchemaRef(freshnessResponses?.["200"]), `#/components/schemas/${FreshnessResponseDto.name}`);
    for (const status of ["400", "401", "403"]) {
      assert.equal(responseSchemaRef(freshnessResponses?.[status]), `#/components/schemas/${FreshnessErrorDto.name}`);
    }

    const selectionSchema = swagger.components?.schemas?.ExplorationSelectionDto as
      { properties?: Record<string, unknown> } | undefined;
    assert.deepEqual(Object.keys(selectionSchema?.properties ?? {}).sort(), [
      "dimensionIds",
      "domain",
      "filters",
      "limit",
      "measureFilters",
      "measureIds",
      "timeWindow",
    ]);
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

function responseSchemaRef(response: unknown): string | undefined {
  return (response as { content?: { "application/json"?: { schema?: { $ref?: string } } } } | undefined)?.content?.[
    "application/json"
  ]?.schema?.$ref;
}

function registeredRoutes(app: INestApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    _router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  };
  return express._router.stack
    .flatMap((layer) => {
      if (!layer.route) return [];
      return Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route?.path}`);
    })
    .filter((route) => !route.startsWith("GET /api/docs"))
    .sort();
}

function assertActionGuard(controller: Function, action: string): void {
  type ActionGuardConstructor = new () => { canActivate(context: ExecutionContext): boolean };
  const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as Array<typeof AuthGuard | ActionGuardConstructor>;
  assert.ok(guards.includes(AuthGuard));
  const ActionGuard = guards.find((guard) => guard !== AuthGuard) as ActionGuardConstructor | undefined;
  assert.ok(ActionGuard);
  assert.throws(
    () => new ActionGuard().canActivate(context({ ...user, permissions: { ...user.permissions, actions: [] } })),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  assert.equal(
    new ActionGuard().canActivate(context({ ...user, permissions: { ...user.permissions, actions: [action] } })),
    true,
  );
}

function context(authUser: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthedRequest }),
  } as ExecutionContext;
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { actions: ["report"], domains: [], measureIds: [], dimensionIds: [] },
  scope: [],
};
