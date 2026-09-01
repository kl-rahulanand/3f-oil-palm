import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import { createDb, createPool } from "../db/pool";
import { AdminGuard, AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { DimensionValuesService } from "../core/dimension-values.service";
import { RbacService } from "../core/rbac.service";
import { SessionService } from "../core/session.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { AccessMetadataController } from "./access-metadata.controller";
import { AccessMetadataService } from "./access-metadata.service";

process.env.DIMENSION_ENUM_MAX = "3";

class MetadataWarehouse implements Warehouse {
  readonly calls: Array<{ goldObject: string; column: string }> = [];

  async explain(): Promise<void> {}

  async execute(): Promise<QueryResult> {
    return { columns: [], rows: [] };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(goldObject: string, column: string): Promise<string[]> {
    this.calls.push({ goldObject, column });
    return ["one", "two", "three", "four", "five"];
  }
}

const pool = createPool();
const db = createDb(pool);
const semantic = new SemanticLayer();
const warehouse = new MetadataWarehouse();
const dimensionValues = new DimensionValuesService(warehouse);
const service = new AccessMetadataService(db, semantic, dimensionValues);
const controller = new AccessMetadataController(service);

after(async () => {
  await pool.end();
});

test("AdminGuard rejects a non-admin principal with 403", () => {
  const request = {
    authUser: {
      id: "user-id",
      email: "analyst@example.com",
      display_name: "Analyst",
      is_active: true,
      roles: ["analyst"],
      permissions: { domains: [], measureIds: [], dimensionIds: [], actions: ["save"] },
      scope: [],
    },
  } as unknown as AuthedRequest;

  assert.throws(
    () => new AdminGuard().canActivate(makeContext(request)),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
});

test("AuthGuard rejects an unauthenticated request with 401", async () => {
  const guard = new AuthGuard({} as SessionService, {} as RbacService);

  await assert.rejects(
    () => guard.canActivate(makeContext({ headers: {} } as AuthedRequest)),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 401,
  );
});

test("metadata uses semantic-owned gold columns and bounded cached distinct values", async () => {
  const first = await controller.get();
  const callsAfterFirstRequest = warehouse.calls.length;
  const second = await controller.get();

  assert.ok(first.roles.some((role) => role.id === "admin"));
  assert.deepEqual(second, first);
  assert.equal(warehouse.calls.length, callsAfterFirstRequest);
  assert.equal(callsAfterFirstRequest, first.scopeAttributes.length);
  assert.ok(first.scopeAttributes.every((attribute) => attribute.values.length === 3));

  const expectedSources = semanticScopeSources(semantic);
  assert.deepEqual(
    warehouse.calls,
    first.scopeAttributes.map((attribute) => ({
      goldObject: expectedSources.get(attribute.id)?.goldObject,
      column: expectedSources.get(attribute.id)?.column,
    })),
  );

  assert.deepEqual(
    first.grantOptions.domains,
    semantic.all().map((domain) => ({ id: domain.name, label: domain.label })),
  );
  assert.equal(controller.get.length, 0);
});

function semanticScopeSources(
  layer: SemanticLayer,
): Map<string, { goldObject: string; column: string }> {
  const sources = new Map<string, { goldObject: string; column: string }>();

  for (const domain of layer.all()) {
    if (domain.scopeColumn && !sources.has(domain.scopeColumn)) {
      const dimension = domain.dimensions.find(
        (candidate) =>
          candidate.id === domain.scopeColumn || candidate.column === domain.scopeColumn,
      );
      sources.set(domain.scopeColumn, {
        goldObject: domain.goldObject,
        column: dimension?.column ?? domain.scopeColumn,
      });
    }
    for (const dimension of domain.dimensions) {
      if (!sources.has(dimension.id)) {
        sources.set(dimension.id, {
          goldObject: domain.goldObject,
          column: dimension.column,
        });
      }
    }
  }

  return sources;
}

function makeContext(request: AuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
