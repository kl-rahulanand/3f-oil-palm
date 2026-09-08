import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";
import { AuthoredMeasureRegistry } from "./measures/authored-measure.registry";
import { configureApp } from "./main";

test("Swagger is not mounted when NODE_ENV is production even if ENABLE_SWAGGER is set", async () => {
  const environment = { ...process.env };
  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  process.env.NODE_ENV = "production";
  process.env.ENABLE_SWAGGER = "true";
  process.env.AUTH_JWT_SECRET = "production-test-secret";
  delete process.env.AUTH_OTP_MOCK;
  let app: INestApplication | undefined;

  try {
    const config = loadConfig();
    assert.equal(config.swaggerEnabled, false);
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app, config);
    await app.init();

    for (const path of [
      "/api/docs",
      "/api/docs/",
      "/api/docs/swagger-ui-init.js",
      "/api/docs-json",
      "/api/docs-yaml",
    ]) {
      assert.equal(registeredPaths(app).includes(path), false, `${path} must fall through to 404`);
    }
  } finally {
    process.env = environment;
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

function registeredPaths(app: INestApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    _router: { stack: Array<{ route?: { path: string } }> };
  };
  return express._router.stack.flatMap((layer) => (layer.route ? [layer.route.path] : []));
}
