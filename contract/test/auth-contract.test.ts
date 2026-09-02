import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authLogoutRequestSchema,
  authLogoutResponseSchema,
  authMeResponseSchema,
  authOtpRequestResponseSchema,
  authOtpRequestSchema,
  authOtpVerifyRequestSchema,
  authOtpVerifyResponseSchema,
  authRefreshRequestSchema,
  authRefreshResponseSchema,
  authUserSchema,
} from "../src/index.ts";

const authUser = {
  id: "user-1",
  email: "analyst@example.com",
  display_name: "Example Analyst",
  is_active: true,
  roles: ["analyst"],
  permissions: {
    domains: ["fixture"],
    measureIds: ["fixture.measure"],
    dimensionIds: ["branch"],
    actions: ["save", "pin"],
  },
  scope: [{ attribute: "region_code", value: "NZ" }],
};

test("OTP request schema accepts email and returns uniform ack", () => {
  assert.deepEqual(authOtpRequestSchema.parse({ email: "analyst@example.com" }), {
    email: "analyst@example.com",
  });
  assert.deepEqual(authOtpRequestResponseSchema.parse({ ok: true }), { ok: true });
});

test("OTP request schema rejects malformed email", () => {
  assert.throws(() => authOtpRequestSchema.parse({ email: "not-an-email" }));
});

test("OTP verify schema accepts email and six-digit code", () => {
  assert.deepEqual(authOtpVerifyRequestSchema.parse({ email: "analyst@example.com", code: "123456" }), {
    email: "analyst@example.com",
    code: "123456",
  });
  assert.deepEqual(authOtpVerifyResponseSchema.parse(authUser), authUser);
});

test("OTP verify schema rejects missing or malformed code", () => {
  assert.throws(() => authOtpVerifyRequestSchema.parse({ email: "analyst@example.com" }));
  assert.throws(() => authOtpVerifyRequestSchema.parse({ email: "analyst@example.com", code: "12345" }));
  assert.throws(() => authOtpVerifyRequestSchema.parse({ email: "analyst@example.com", code: "abcdef" }));
});

test("cookie-based refresh and logout schemas carry no body tokens", () => {
  assert.deepEqual(authRefreshRequestSchema.parse({}), {});
  assert.deepEqual(authRefreshResponseSchema.parse({ ok: true }), { ok: true });
  assert.deepEqual(authLogoutRequestSchema.parse({}), {});
  assert.deepEqual(authLogoutResponseSchema.parse({ ok: true }), { ok: true });
  assert.throws(() => authRefreshRequestSchema.parse({ token: "body-token" }));
  assert.throws(() => authLogoutResponseSchema.parse({ token: "body-token" }));
});

test("AuthUser identity is email-based and keeps normalized RBAC fields", () => {
  const parsed = authUserSchema.parse(authUser);
  assert.equal(parsed.email, "analyst@example.com");
  assert.equal(parsed.display_name, "Example Analyst");
  assert.equal(parsed.is_active, true);
  assert.deepEqual(parsed.roles, ["analyst"]);
  assert.deepEqual(parsed.permissions.actions, ["save", "pin"]);
  assert.deepEqual(parsed.scope, [{ attribute: "region_code", value: "NZ" }]);
  assert.deepEqual(authMeResponseSchema.parse(authUser), authUser);
  assert.throws(() => authUserSchema.parse({ ...authUser, username: "analyst" }));
});
