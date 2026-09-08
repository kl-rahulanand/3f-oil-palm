import "reflect-metadata";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import { test } from "node:test";
import type { ErrorEnvelope } from "@3f/contract";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { CsrfGuard } from "../auth/csrf.guard";
import { loadConfig } from "../config";
import { configureApp } from "../main";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("an unhandled 500 and a guarded 4xx both return the constitution-07 error envelope with every field populated and a generated correlationId, no stack outside Local, proving the filter and middleware are installed via configureApp and app.init", async () => {
  const originalRegistryInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  const originalCsrfGuard = CsrfGuard.prototype.canActivate;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app, { ...loadConfig(), environment: "Development", swaggerEnabled: false });
    await app.init();

    const forbidden = await request(app, "/api/auth/logout", "POST");
    assert.equal(forbidden.status, 403);
    assertEnvelope(forbidden.body, forbidden.headers.get("x-correlation-id") ?? null, 403);

    CsrfGuard.prototype.canActivate = () => {
      throw new Error("private failure detail");
    };
    const internal = await request(app, "/api/auth/logout", "POST");
    assert.equal(internal.status, 500);
    assertEnvelope(internal.body, internal.headers.get("x-correlation-id") ?? null, 500);
  } finally {
    CsrfGuard.prototype.canActivate = originalCsrfGuard;
    AuthoredMeasureRegistry.prototype.onModuleInit = originalRegistryInit;
    await app?.close();
  }
});

function assertEnvelope(body: ErrorEnvelope, responseCorrelationId: string | null, statusCode: number): void {
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.match(body.error.errorId, UUID_PATTERN);
  assert.ok(body.error.code);
  assert.ok(body.error.type);
  assert.ok(body.error.message);
  assert.ok(body.error.userMessage);
  assert.equal(typeof body.error.details, "object");
  assert.equal(body.error.statusCode, statusCode);
  assert.match(body.error.correlationId, UUID_PATTERN);
  assert.equal(body.error.correlationId, responseCorrelationId);
  assert.equal(body.error.requestId, null);
  assert.equal(body.error.environment, "Development");
  assert.ok(Number.isFinite(Date.parse(body.error.timestampUtc)));
  assert.equal("stack" in body.error, false);
  assert.doesNotMatch(JSON.stringify(body), /private failure detail/);
}

async function request(
  app: INestApplication,
  path: string,
  method: string,
): Promise<{ status: number; headers: Map<string, string>; body: ErrorEnvelope }> {
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
  req.headers = {};
  const res = new ServerResponse(req);
  res.assignSocket(socket);
  const finished = new Promise<void>((resolve) => res.once("finish", resolve));
  app.getHttpAdapter().getInstance()(req, res);
  req.push(null);
  await finished;

  const [head, body = ""] = Buffer.concat(chunks).toString("utf8").split("\r\n\r\n");
  const lines = head.split("\r\n");
  const status = Number(lines.shift()?.split(" ")[1]);
  const headers = new Map(
    lines.map((line) => {
      const separator = line.indexOf(":");
      return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
    }),
  );
  return { status, headers, body: JSON.parse(body) as ErrorEnvelope };
}
