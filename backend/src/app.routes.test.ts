import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException, type ExecutionContext, type INestApplication } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import type { AuthUser } from "@3f/contract";
import { AppModule } from "./app.module";
import { type AuthedRequest, AuthGuard } from "./auth/auth.guard";
import { ChatController } from "./chat/chat.controller";
import { AuthoredMeasureRegistry } from "./measures/authored-measure.registry";
import { configureApp } from "./main";

test("the chat routes are registered behind the governed report action and no unowned help or conversations route appears in the allow list", async () => {
  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    assert.deepEqual(registeredRoutes(app), [
      "GET /api/auth/csrf",
      "GET /api/auth/me",
      "GET /api/mis/options",
      "GET /health",
      "POST /api/auth/logout",
      "POST /api/auth/otp/request",
      "POST /api/auth/otp/verify",
      "POST /api/auth/refresh",
      "POST /api/chat",
      "POST /api/chat/stream",
      "POST /api/ingest/actuals",
      "POST /api/ingest/budget",
      "POST /api/mis/run",
      "POST /api/mis/statement",
      "POST /api/mis/statement/drill",
      "POST /api/mis/statement/export",
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

    type ReportGuardConstructor = new () => { canActivate(context: ExecutionContext): boolean };
    const guards = Reflect.getMetadata(GUARDS_METADATA, ChatController) as Array<
      typeof AuthGuard | ReportGuardConstructor
    >;
    assert.ok(guards.includes(AuthGuard));
    const ReportGuard = guards.find((guard) => guard !== AuthGuard) as ReportGuardConstructor | undefined;
    assert.ok(ReportGuard);
    assert.throws(
      () => new ReportGuard().canActivate(context({ ...user, permissions: { ...user.permissions, actions: [] } })),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
    );
    assert.equal(new ReportGuard().canActivate(context(user)), true);
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

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
