import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../app.module";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { buildSwaggerConfig, configureApp } from "../main";
import { HealthController } from "./health.controller";

test("the health endpoint returns the response envelope with status ok and a matching generated schema", async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(new HealthController().health())), {
    success: true,
    data: { status: "ok" },
    error: null,
  });

  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    const response = document.paths["/health"]?.get?.responses?.["200"] as {
      content?: { "application/json"?: { schema?: { $ref?: string } } };
    };
    const schema = document.components?.schemas?.HealthResponseDto as {
      properties?: Record<string, { example?: unknown; nullable?: boolean; $ref?: string }>;
    };
    const dataSchema = document.components?.schemas?.HealthDataDto as {
      properties?: Record<string, { example?: unknown }>;
    };

    assert.ok(response);
    assert.equal(response.content?.["application/json"]?.schema?.$ref, "#/components/schemas/HealthResponseDto");
    assert.equal(schema.properties?.success.example, true);
    assert.equal(schema.properties?.data.$ref, "#/components/schemas/HealthDataDto");
    assert.equal(schema.properties?.error.example, null);
    assert.equal(schema.properties?.error.nullable, true);
    assert.equal(dataSchema.properties?.status.example, "ok");
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});
