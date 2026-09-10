import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext, HttpException, type INestApplication } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { AuthUser, MisSelectionRunRequest } from "@3f/contract";
import { AppModule } from "../app.module";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { buildSwaggerConfig } from "../main";
import { MisSelectionController } from "./mis-selection.controller";
import type { MisSelectionService } from "./mis-selection.service";

test("the run route accepts only department function plant and period and rejects any attempt to supply cost centre triples GL codes a format id or a scope, and both routes require the authenticated governed read action so an unauthorised caller is refused before any query is built", async () => {
  const service = new FakeMisSelectionService();
  const controller = new MisSelectionController(service as unknown as MisSelectionService);
  const request = { department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" };

  for (const forged of [{ triples: [] }, { glCodes: ["5000"] }, { formatId: "forged" }, { scope: { plant: "*" } }]) {
    await assert.rejects(
      async () => controller.run(user(["report"]), { ...request, ...forged }),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
    );
  }
  assert.equal(service.runCalls, 0);
  await controller.run(user(["report"]), request);
  assert.equal(service.runCalls, 1);

  const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, MisSelectionController) as Function[];
  assert.ok(controllerGuards.includes(AuthGuard));
  for (const handler of [MisSelectionController.prototype.options, MisSelectionController.prototype.run]) {
    const [ActionGuard] = Reflect.getMetadata(GUARDS_METADATA, handler) as Array<
      new () => { canActivate(context: ExecutionContext): boolean }
    >;
    assert.throws(
      () => new ActionGuard().canActivate(context(user([]))),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
    );
    assert.equal(new ActionGuard().canActivate(context(user(["report"]))), true);
  }

  const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
  AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    assert.deepEqual(Object.keys(document.paths["/api/mis/options"]?.get?.responses ?? {}).sort(), [
      "200",
      "400",
      "401",
      "403",
    ]);
    assert.deepEqual(Object.keys(document.paths["/api/mis/run"]?.post?.responses ?? {}).sort(), [
      "200",
      "400",
      "401",
      "403",
    ]);
  } finally {
    AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
    await app?.close();
  }
});

class FakeMisSelectionService {
  runCalls = 0;

  async run(_user: AuthUser, _request: MisSelectionRunRequest) {
    this.runCalls += 1;
    return {
      outcome: "unresolvable" as const,
      notice: "No mapping configured" as const,
      result: { columns: [], rows: [] },
      totals: { actual: 0, budget: 0, percentage: null },
      bucketRows: [] as [],
    };
  }
}

function user(actions: string[]): AuthUser {
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["admin"],
    permissions: { actions, domains: [], measureIds: [], dimensionIds: [] },
    scope: [{ attribute: "plant", value: "DUB" }],
  };
}

function context(authUser: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthedRequest }),
  } as ExecutionContext;
}
