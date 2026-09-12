import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { type ArgumentsHost, type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA } from "@nestjs/common/constants";
import type { AuthUser } from "@3f/contract";
import { RequireAction, type AuthedRequest } from "../auth/auth.guard";
import type { AuditService } from "../core/audit.service";
import { PinsController } from "../pins/pins.controller";
import { SavedController } from "../saved/saved.controller";
import { ExplorationAuditFilter } from "./exploration-audit.filter";

test("a require action denial thrown by the guard is audited by the route scoped filter before the request fails", async () => {
  const order: string[] = [];
  const events: unknown[] = [];
  const audit = {
    async writeExplorationRefusalEvent(event: unknown) {
      order.push("audit");
      events.push(event);
      return 1;
    },
  } as AuditService;
  const request = {
    authUser: USER,
    sessionId: SESSION_ID,
    body: { selection: "submitted" },
    method: "POST",
    originalUrl: "/api/saved",
    route: { path: "/api/saved" },
    baseUrl: "",
  } as unknown as AuthedRequest;
  const response = new FakeResponse(order);
  const SaveGuard = RequireAction("save");
  for (const controller of [SavedController, PinsController]) {
    const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, controller) as Function[];
    assert.ok(filters.includes(ExplorationAuditFilter));
  }
  let refusal: unknown;
  try {
    new SaveGuard().canActivate(context(request));
  } catch (error) {
    refusal = error;
  }

  await new ExplorationAuditFilter(audit).catch(
    refusal ?? new ForbiddenException("Requires 'save' action"),
    host(request, response),
  );

  assert.deepEqual(order, ["audit", "response"]);
  assert.deepEqual(events, [
    {
      actorId: USER.id,
      sessionId: SESSION_ID,
      resource: "saved",
      action: "create",
      submitted: request.body,
    },
  ]);
  assert.equal(response.statusCode, 403);
});

class FakeResponse {
  statusCode = 0;
  constructor(private readonly order: string[]) {}
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json() {
    this.order.push("response");
    return this;
  }
}

function context(request: AuthedRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}

function host(request: AuthedRequest, response: FakeResponse): ArgumentsHost {
  return { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as ArgumentsHost;
}

const SESSION_ID = "00000000-0000-0000-0000-000000000099";
const USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["finance"],
  permissions: { actions: [], domains: [], measureIds: [], dimensionIds: [] },
  scope: [],
};
