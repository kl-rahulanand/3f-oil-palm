import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionContext, HttpException, type INestApplication } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { AuthUser } from "@3f/contract";
import { AppModule } from "../app.module";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { baseRolePerms } from "../db/migrate";
import { GRANT_ACTIONS } from "../grants/grants.constants";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { buildSwaggerConfig, configureApp } from "../main";
import { IngestController } from "./ingest.controller";

test("POST /api/ingest/actuals is guarded by AuthGuard plus the ingest action grant, appears in the strict route allow-list, rejects a CSRF-less or forbidden request, and documents its multipart DTO", async () => {
  const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, IngestController) as Function[];
  assert.ok(controllerGuards.includes(AuthGuard));
  assert.ok(GRANT_ACTIONS.includes("ingest"));
  assert.ok(
    baseRolePerms.some(
      ({ role, grantType, grantId }) => role === "admin" && grantType === "action" && grantId === "ingest",
    ),
  );

  const [ActionGuard] = Reflect.getMetadata(GUARDS_METADATA, IngestController.prototype.actuals) as Array<
    new () => { canActivate(context: ExecutionContext): boolean }
  >;
  assert.throws(
    () => new ActionGuard().canActivate(context(requestWithActions([]))),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  assert.equal(new ActionGuard().canActivate(context(requestWithActions(["ingest"]))), true);

  assert.throws(
    () => new CsrfGuard().canActivate(context({ method: "POST", headers: {} } as AuthedRequest)),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );

  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    assert.ok(registeredRoutes(app).includes("POST /api/ingest/actuals"));

    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    const operation = document.paths["/api/ingest/actuals"]?.post;
    const requestBody = operation?.requestBody as {
      content?: { "multipart/form-data"?: { schema?: { $ref?: string } } };
    };
    assert.equal(
      requestBody.content?.["multipart/form-data"]?.schema?.$ref,
      "#/components/schemas/IngestActualsMultipartDto",
    );
    assert.deepEqual(Object.keys(operation?.responses ?? {}).sort(), ["201", "400", "401", "403", "413"]);
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

function requestWithActions(actions: string[]): AuthedRequest {
  return {
    method: "POST",
    headers: {},
    authUser: {
      id: "user-1",
      email: "user@example.invalid",
      display_name: "User",
      roles: ["admin"],
      scope: [],
      permissions: { domains: [], measureIds: [], dimensionIds: [], actions },
      is_active: true,
    } satisfies AuthUser,
  } as unknown as AuthedRequest;
}

function context(request: AuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ cookie: () => undefined }),
    }),
  } as ExecutionContext;
}

function registeredRoutes(app: INestApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    _router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  };
  return express._router.stack.flatMap((layer) =>
    layer.route ? Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route?.path}`) : [],
  );
}
