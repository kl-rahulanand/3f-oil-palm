import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AuthoredMeasureRegistry } from "./measures/authored-measure.registry";
import { configureApp } from "./main";

test("only the sanctioned allow-list is registered and unowned capability routes are absent", async () => {
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
      "GET /health",
      "POST /api/auth/logout",
      "POST /api/auth/otp/request",
      "POST /api/auth/otp/verify",
      "POST /api/auth/refresh",
      "POST /api/ingest/actuals",
      "POST /api/ingest/budget",
    ]);
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
