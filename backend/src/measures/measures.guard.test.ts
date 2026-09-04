import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import type { AuthUser } from "@3f/contract";
import { DbaGuard, type AuthedRequest } from "../auth/auth.guard";

test("DbaGuard permits explicit DBAs and rejects administrators without the DBA role", () => {
  const guard = new DbaGuard();
  assert.equal(guard.canActivate(context(user(["dba"]))), true);
  assert.throws(
    () => guard.canActivate(context(user(["admin"]))),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
});

function user(roles: string[]): AuthUser {
  return {
    id: "00000000-0000-4000-8000-000000000700",
    email: "role-check@example.invalid",
    display_name: "Role Check",
    is_active: true,
    roles,
    permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
    scope: [],
  };
}

function context(authUser: AuthUser): ExecutionContext {
  const request = { authUser } as AuthedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
