import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { ChatController } from "./chat/chat.controller";
import { UsersController } from "./users/users.controller";
import { GrantsController } from "./grants/grants.controller";
import { ReportsController } from "./reports/reports.controller";
import { PinsController } from "./pins/pins.controller";
import { SavedController } from "./saved/saved.controller";
import { buildSwaggerConfig } from "./main";

test("controller metadata contains auth, admin, and data API paths without bearer security", () => {
  const paths = [
    ...controllerRoutes(AuthController),
    ...controllerRoutes(ChatController),
    ...controllerRoutes(UsersController),
    ...controllerRoutes(GrantsController),
    ...controllerRoutes(ReportsController),
    ...controllerRoutes(PinsController),
    ...controllerRoutes(SavedController),
  ];

  for (const expected of [
    "POST /api/auth/otp/request",
    "POST /api/auth/otp/verify",
    "GET /api/auth/csrf",
    "GET /api/auth/me",
    "POST /api/auth/refresh",
    "POST /api/auth/logout",
    "POST /api/chat",
    "GET /api/admin/users",
    "POST /api/admin/users",
    "PATCH /api/admin/users/:id",
    "POST /api/admin/users/:id/deactivate",
    "GET /api/admin/grants",
    "POST /api/admin/grants",
    "GET /api/reports",
    "POST /api/reports/:id/run",
    "POST /api/saved",
    "GET /api/saved",
    "DELETE /api/saved/:id",
    "POST /api/pins",
    "GET /api/pins",
    "PATCH /api/pins/reorder",
    "PATCH /api/pins/:id/view",
    "DELETE /api/pins/:id",
  ]) {
    assert.ok(paths.includes(expected), `missing ${expected}`);
  }

  const swagger = buildSwaggerConfig();
  assert.equal(swagger.info.title, "3F API");
  assert.equal(swagger.components?.securitySchemes?.bearer, undefined);
});

function controllerRoutes(controller: Function): string[] {
  const prefix = normalizePath(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== "constructor")
    .flatMap((name) => {
      const handler = controller.prototype[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || path === undefined) return [];
      const methodName = RequestMethod[method];
      return (Array.isArray(path) ? path : [path]).map(
        (route) => `${methodName} ${joinPaths(prefix, normalizePath(route))}`,
      );
    });
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function joinPaths(prefix: string, path: string): string {
  return `/${[prefix, path].filter(Boolean).join("/")}`;
}
