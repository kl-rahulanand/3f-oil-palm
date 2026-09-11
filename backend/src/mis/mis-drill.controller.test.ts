import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext, ForbiddenException, type ArgumentsHost } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuthUser, MisDrillRequest, MisDrillResponse } from "@3f/contract";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import type { AuditService } from "../core/audit.service";
import { MisDrillAuditFilter } from "./mis-drill.audit.filter";
import { MisDrillController } from "./mis-drill.controller";
import type { IMisDrillService } from "./mis-drill.interface";

test("the request schema rejects a pinned batch id that is not a uuid before any sql is built", () => {
  const service = new EmptyDrillService();
  const controller = new MisDrillController(service);
  assert.throws(() =>
    controller.run(user, SESSION_ID, { ...request(), pinnedBatches: [{ ...ACTUAL, batchId: "not-sql-safe'" }] }),
  );
  assert.equal(service.calls, 0);
});

test("an authenticated drill refused by the route guards is audited with the predicate as submitted and never the resolved predicate", async () => {
  const events: unknown[] = [];
  const audit = {
    async writeDrillRefusalEvent(event: unknown) {
      events.push(event);
      return 1;
    },
  } as AuditService;
  const filter = new MisDrillAuditFilter(audit);
  const submitted = request();
  const response = new FakeResponse();
  const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, MisDrillController) as Function[];
  assert.ok(controllerGuards.includes(AuthGuard));
  const [ReportGuard] = Reflect.getMetadata(GUARDS_METADATA, MisDrillController.prototype.run) as Array<
    new () => { canActivate(context: ExecutionContext): boolean }
  >;
  const routeFilters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, MisDrillController.prototype.run) as Function[];
  assert.ok(routeFilters.includes(MisDrillAuditFilter));

  let refusal: unknown;
  try {
    new ReportGuard().canActivate(executionContext({ ...user, permissions: { ...user.permissions, actions: [] } }));
  } catch (error) {
    refusal = error;
  }
  await filter.catch(
    refusal ?? new ForbiddenException("Requires 'report' action"),
    host({ authUser: user, sessionId: SESSION_ID, body: submitted }, response),
  );

  assert.deepEqual(events, [{ actorId: user.id, sessionId: SESSION_ID, submitted }]);
  assert.equal(JSON.stringify(events).includes("leafKey"), false);
  assert.equal(response.statusCode, 403);

  await filter.catch(
    new ForbiddenException("missing or invalid CSRF token"),
    host({ body: submitted }, new FakeResponse()),
  );
  assert.equal(events.length, 1);
});

test("the drill route refuses an out of range page and returns an empty result as a zero row success with a zero footer", async () => {
  const service = new EmptyDrillService();
  const controller = new MisDrillController(service);
  assert.throws(() => controller.run(user, SESSION_ID, { ...request(), page: 0 }));
  assert.deepEqual(await controller.run(user, SESSION_ID, request()), EMPTY_RESPONSE);
});

class EmptyDrillService implements IMisDrillService {
  calls = 0;
  async run(): Promise<MisDrillResponse> {
    this.calls += 1;
    return EMPTY_RESPONSE;
  }
}

class FakeResponse {
  statusCode = 0;
  body: unknown;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(body: unknown) {
    this.body = body;
    return this;
  }
}

function host(requestValue: unknown, response: FakeResponse): ArgumentsHost {
  return { switchToHttp: () => ({ getRequest: () => requestValue, getResponse: () => response }) } as ArgumentsHost;
}

function executionContext(authUser: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthedRequest }),
  } as ExecutionContext;
}

const SESSION_ID = "00000000-0000-0000-0000-000000000099";
const ACTUAL = { source: "actuals" as const, period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000001" };
const BUDGET = { source: "budget" as const, period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000002" };

function request(): MisDrillRequest {
  return {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    nodeKey: "leaf-node",
    block: "selected",
    pinnedBatches: [ACTUAL, BUDGET],
    page: 1,
  };
}

const EMPTY_RESPONSE: MisDrillResponse = {
  nodeKey: "leaf-node",
  leafKey: "leaf",
  lines: [],
  footer: { debit: "0.00", credit: "0.00", value: "0.00" },
  totalCount: 0,
  page: 1,
  pageSize: 100,
  actualBatchIds: [ACTUAL.batchId],
  budgetBatchId: BUDGET.batchId,
  batchStatuses: [],
};

const user: AuthUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["finance"],
  permissions: { actions: ["report"], domains: ["mis-statement"], measureIds: [], dimensionIds: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
