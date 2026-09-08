import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { loadConfig, mapEnvironment } from "../config";
import { configureApp } from "../main";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { StructuredLogger, type StructuredLogRecord } from "./structured.logger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("the request and error log records share the request correlationId and requestId and carry every required field, honoring a valid inbound x-correlation-id and generating a UUID for an absent or invalid one", async () => {
  const originalRegistryInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  const records: StructuredLogRecord[] = [];
  const config = { ...loadConfig(), environment: "QA" as const, swaggerEnabled: false };
  const logger = new StructuredLogger(config, (record) => records.push(record));
  let app: INestApplication | undefined;

  try {
    assert.equal(mapEnvironment("production"), "Production");
    assert.equal(mapEnvironment("unknown"), "Local");
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app, config, logger);
    await app.init();

    const inboundCorrelationId = randomUUID();
    const failed = await request(app, "/api/auth/logout", "POST", {
      "x-correlation-id": inboundCorrelationId,
      "x-request-id": "req-123",
    });
    assert.equal(failed.status, 403);
    assert.equal(failed.headers.get("x-correlation-id"), inboundCorrelationId);

    const related = records.filter((record) => record.correlationId === inboundCorrelationId);
    assert.equal(related.length, 2);
    const requestRecord = related.find((record) => record.message === "HTTP request completed");
    const errorRecord = related.find((record) => record.message === "HTTP exception");
    assert.ok(requestRecord);
    assert.ok(errorRecord);
    assertRequiredFields(requestRecord);
    assertRequiredFields(errorRecord);
    assert.equal(requestRecord.requestId, "req-123");
    assert.equal(errorRecord.requestId, "req-123");
    assert.equal(requestRecord.accountId, null);
    assert.equal(errorRecord.accountId, null);
    assert.equal(requestRecord.level, "info");
    assert.equal(errorRecord.level, "debug");

    const missing = await request(app, "/health");
    const missingCorrelationId = missing.headers.get("x-correlation-id");
    assert.match(missingCorrelationId ?? "", UUID_PATTERN);
    assertRequiredFields(records.find((record) => record.correlationId === missingCorrelationId));

    const invalid = await request(app, "/health", "GET", { "x-correlation-id": "not-a-uuid" });
    const generatedCorrelationId = invalid.headers.get("x-correlation-id");
    assert.match(generatedCorrelationId ?? "", UUID_PATTERN);
    assert.notEqual(generatedCorrelationId, "not-a-uuid");
    assertRequiredFields(records.find((record) => record.correlationId === generatedCorrelationId));
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalRegistryInit;
    await app?.close();
  }
});

function assertRequiredFields(record: StructuredLogRecord | undefined): asserts record {
  assert.ok(record);
  for (const field of [
    "timestampUtc",
    "level",
    "message",
    "context",
    "environment",
    "serviceName",
    "module",
    "correlationId",
    "accountId",
    "requestId",
  ]) {
    assert.ok(field in record, `${field} must be present`);
  }
  assert.ok(Number.isFinite(Date.parse(record.timestampUtc)));
  assert.equal(record.environment, "QA");
  assert.equal(record.serviceName, "3f-backend");
  assert.equal(record.module, "HTTP");
  assert.equal(typeof record.context, "object");
}

async function request(
  app: INestApplication,
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Map<string, string> }> {
  const chunks: Buffer[] = [];
  const socket = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  }) as unknown as Socket;
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = path;
  req.headers = headers;
  const res = new ServerResponse(req);
  res.assignSocket(socket);
  const finished = new Promise<void>((resolve) => res.once("finish", resolve));
  app.getHttpAdapter().getInstance()(req, res);
  req.push(null);
  await finished;

  const head = Buffer.concat(chunks).toString("utf8").split("\r\n\r\n")[0];
  const lines = head.split("\r\n");
  const status = Number(lines.shift()?.split(" ")[1]);
  return {
    status,
    headers: new Map(
      lines.map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
      }),
    ),
  };
}
