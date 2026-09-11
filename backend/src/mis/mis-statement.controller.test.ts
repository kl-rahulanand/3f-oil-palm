import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuthUser, MisSelectionRunRequest } from "@3f/contract";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import type { SelectionExecutor } from "../chat/selectionExecutor";
import type { ISelectionResolverService, MasterSelectionResolution } from "../mapping/selection-resolver.interface";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { IStatementOutlineRepository } from "../warehouse/statement-outline.interface";
import { MisStatementController } from "./mis-statement.controller";
import { MisStatementService } from "./mis-statement.service";

test("the statement route refuses an unauthorized plant but returns the unresolvable outcome with its notice for a plant the master does not cover and a configured zero statement without the notice when there are no transactions", async () => {
  const service = new MisStatementService(
    new RouteResolver(),
    new SemanticLayer(),
    new EmptyExecutor() as unknown as SelectionExecutor,
    new OneLeafOutline(),
  );
  const controller = new MisStatementController(service);

  await assert.rejects(
    () => controller.run(user, request("FORBIDDEN")),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  await assert.rejects(
    () => service.run({ ...user, permissions: { ...user.permissions, dimensionIds: [] } }, request("DUB")),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  assert.deepEqual(await controller.run(user, request("UNCOVERED")), {
    outcome: "unresolvable",
    notice: "No mapping configured",
    tree: [],
    grandTotal: null,
    provenance: { activeBatchIds: [] },
  });

  const resolved = await controller.run(user, request("DUB"));
  assert.equal(resolved.outcome, "resolved");
  if (resolved.outcome !== "resolved") return;
  assert.equal("notice" in resolved, false);
  assert.equal(resolved.tree[0].budgetComponent, "Configured leaf");
  assert.deepEqual(
    resolved.tree[0].measures.map(({ budget, actual }) => ({ budget, actual })),
    [
      { budget: "0.00", actual: "0.00" },
      { budget: "0.00", actual: "0.00" },
    ],
  );

  const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, MisStatementController) as Function[];
  assert.ok(controllerGuards.includes(AuthGuard));
  const [ReportGuard] = Reflect.getMetadata(GUARDS_METADATA, MisStatementController.prototype.run) as Array<
    new () => { canActivate(context: ExecutionContext): boolean }
  >;
  assert.throws(
    () => new ReportGuard().canActivate(context({ ...user, permissions: { ...user.permissions, actions: [] } })),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  assert.equal(new ReportGuard().canActivate(context(user)), true);
});

class RouteResolver implements ISelectionResolverService {
  async options() {
    return { departments: [], functions: [], plants: [], periods: [] };
  }

  canonicalPlant(plant: string): string | undefined {
    return plant === "UNCOVERED" ? undefined : plant;
  }

  async resolve(request: MisSelectionRunRequest): Promise<MasterSelectionResolution> {
    if (request.plant === "UNCOVERED") return { outcome: "unresolvable" };
    return {
      outcome: "resolved",
      department: request.department,
      function: request.function,
      plant: request.plant,
      costCentres: ["Primary"],
      glCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
      leafTargets: [{ plant: "DUB", costCenter: "Primary", glCode: "5001", target: { kind: "leaf", leafKey: "leaf" } }],
      masterGlCodes: ["5001"],
      period: { value: request.period, from: request.period, to: request.period },
    };
  }
}

class EmptyExecutor {
  authorize(user: AuthUser, _domain: unknown, selection: { dimensionIds: string[] }): void {
    if (!selection.dimensionIds.every((id) => user.permissions.dimensionIds.includes(id))) {
      throw new HttpException("forbidden", 403);
    }
  }

  async run() {
    return { result: { columns: [], rows: [] }, rowSourcePresence: [], activeBatchIds: [] };
  }
}

class OneLeafOutline implements IStatementOutlineRepository {
  async findByBudgetPeriod() {
    return [
      {
        nodeKey: "leaf",
        parentKey: null,
        depth: 0,
        sNo: "1",
        label: "Configured leaf",
        sortOrder: 1,
        glCode: "5001",
        leafKey: "leaf",
      },
    ];
  }
}

function request(plant: string): MisSelectionRunRequest {
  return { department: "Agriculture", function: "Nursery", plant, period: "2026-07-01" };
}

function context(authUser: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthedRequest }),
  } as ExecutionContext;
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["mis-statement"],
    measureIds: [
      "mis-statement.actual_net",
      "mis-statement.budget_net",
      "mis-statement.rollover_net",
      "mis-statement.percentage",
    ],
    dimensionIds: ["leaf_key", "month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
