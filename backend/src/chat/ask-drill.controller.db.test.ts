import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Module, type INestApplication } from "@nestjs/common";
import { ApplicationConfig } from "@nestjs/core/application-config";
import { NestContainer } from "@nestjs/core/injector/container";
import { InstanceLoader } from "@nestjs/core/injector/instance-loader";
import { Injector } from "@nestjs/core/injector/injector";
import { NoopGraphInspector } from "@nestjs/core/inspector/noop-graph-inspector";
import { MetadataScanner } from "@nestjs/core/metadata-scanner";
import { NestApplication } from "@nestjs/core/nest-application";
import { DependenciesScanner } from "@nestjs/core/scanner";
import { ExpressAdapter } from "@nestjs/platform-express";
import { and, eq } from "drizzle-orm";
import { AUTH_COOKIE_NAMES } from "../auth/cookies";
import { ChatModule } from "./chat.module";
import { DRIZZLE_DB, LLM_PROVIDER, WAREHOUSE } from "../config";
import { CoreModule } from "../core/core.module";
import { SessionService } from "../core/session.service";
import { createDb, createPool, type AppDb } from "../db/pool";
import { auditEvents, rolePerms, roles, userRoles, users } from "../db/schema";
import { MockLlmProvider } from "../llm/mock.provider";
import { configureApp } from "../main";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";

process.env.SESSION_SWEEP_INTERVAL_MS = "0";
process.env.STATEMENT_ATTESTATION_SECRETS = "ask-drill-db-test-secret";

test("POST /api/chat/drill audits a missing context through the real HTTP and app-DB boundary", async () => {
  const pool = createPool();
  const db = createDb(pool);
  const warehouse = new NoReadWarehouse();
  const role = `ask-drill-${randomUUID()}`;
  const email = `${role}@example.com`;
  let app: INestApplication | undefined;
  let userId: string | undefined;

  try {
    await db.insert(roles).values({ name: role, label: "Ask drill test" });
    await db.insert(rolePerms).values({ role, grantType: "action", grantId: "report" });
    const inserted = await db
      .insert(users)
      .values({ email, displayName: "Ask drill test", isActive: true })
      .returning({ id: users.id });
    userId = inserted[0].id;
    await db.insert(userRoles).values({ userId, role });

    app = await createTestApp(db, warehouse);
    const session = await app.get(SessionService).create(userId);
    await app.listen(0, "127.0.0.1");

    const response = await fetch(`${await app.getUrl()}/api/chat/drill`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${AUTH_COOKIE_NAMES.access}=${encodeURIComponent(session.accessToken)}`,
      },
      body: JSON.stringify({ rowKey: "50001201", page: 1 }),
    });

    assert.equal(response.status, 403);
    const persisted = await db
      .select({ id: auditEvents.id, eventType: auditEvents.eventType, question: auditEvents.question })
      .from(auditEvents)
      .where(and(eq(auditEvents.userId, userId), eq(auditEvents.eventType, "mis.drill.refusal")));
    assert.deepEqual(persisted, [
      { id: persisted[0]?.id, eventType: "mis.drill.refusal", question: "Ask transaction drill" },
    ]);
    assert.equal(warehouse.reads, 0);
  } finally {
    await app?.close();
    if (userId) await db.delete(auditEvents).where(eq(auditEvents.userId, userId));
    await db.delete(users).where(eq(users.email, email));
    await db.delete(rolePerms).where(eq(rolePerms.role, role));
    await db.delete(roles).where(eq(roles.name, role));
    await pool.end();
  }
});

async function createTestApp(db: AppDb, warehouse: Warehouse): Promise<INestApplication> {
  @Module({ imports: [CoreModule, ChatModule] })
  class AskDrillHttpTestModule {}

  const applicationConfig = new ApplicationConfig();
  const adapter = new ExpressAdapter();
  await adapter.init();
  const container = new NestContainer(applicationConfig);
  container.setHttpAdapter(adapter);
  const scanner = new DependenciesScanner(container, new MetadataScanner(), NoopGraphInspector, applicationConfig);
  await scanner.scan(AskDrillHttpTestModule);
  container.replace(DRIZZLE_DB, { isProvider: true, useValue: db });
  container.replace(WAREHOUSE, { isProvider: true, useValue: warehouse });
  container.replace(LLM_PROVIDER, { isProvider: true, useValue: new MockLlmProvider() });
  await new InstanceLoader(container, new Injector(), NoopGraphInspector).createInstancesOfDependencies();
  scanner.applyApplicationProviders();

  const app = new NestApplication(container, adapter, applicationConfig, NoopGraphInspector, { logger: false });
  configureApp(app);
  await app.init();
  return app;
}

class NoReadWarehouse implements Warehouse {
  reads = 0;

  explain(): Promise<void> {
    return this.unexpectedRead();
  }

  execute(): Promise<QueryResult> {
    return this.unexpectedRead();
  }

  freshness(): Promise<string | null> {
    return this.unexpectedRead();
  }

  distinctValues(): Promise<string[]> {
    return this.unexpectedRead();
  }

  private unexpectedRead<T>(): Promise<T> {
    this.reads += 1;
    return Promise.reject(new Error("The missing-context route must not read the warehouse"));
  }
}
