import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "@3f/contract";
import type { SelectionExecutor } from "../chat/selectionExecutor";
import { MisSelectionService } from "../mis/mis-selection.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { MAPPING_MASTER, type MappingMaster } from "./mapping-master";
import { SelectionResolverService, statementPeriodOptions } from "./selection-resolver.service";

test("the period free mapping lookup reports a mapped triple without being given a period", () => {
  const resolver = new SelectionResolverService(new PeriodWarehouse([]));

  assert.equal(resolver.hasMapping({ department: "Agriculture", function: "Nursery", plant: "DUB-NUR" }), true);
  assert.equal(resolver.hasMapping({ department: "Agriculture", function: "Mill", plant: "DUB" }), false);
});

test("eligible periods exclude a multi month range that a statement cannot resolve", async () => {
  const periods = (await new SelectionResolverService(new PeriodWarehouse(["2026-07-01"])).options()).periods;

  assert.deepEqual(
    periods.map(({ value }) => value),
    ["2026-07-01", "fy26-27-ytd"],
  );
  assert.deepEqual(
    statementPeriodOptions(periods).map(({ value }) => value),
    ["2026-07-01"],
  );
});

test("resolve reuses a caller's period list instead of repeating the ingest_batch query", async () => {
  // The Ask statement path validates the asked period against options() before resolving, so
  // without this the same SELECT ran twice on every statement answer. Counting the warehouse
  // calls is the only way to prove it: the outcome is identical either way.
  let queries = 0;
  const warehouse = {
    async execute() {
      queries += 1;
      return { columns: [{ name: "period", numeric: false }], rows: [{ period: "2026-07-01" }] };
    },
    async explain() {},
    async freshness() {
      return null;
    },
    async distinctValues() {
      return [];
    },
  } as unknown as Warehouse;

  const service = new SelectionResolverService(warehouse);
  const request = { department: "Agriculture", function: "Nursery", plant: "DUB", period: "2026-07-01" };

  const periods = (await service.options()).periods;
  const queriesAfterOptions = queries;
  await service.resolve(request, periods);
  assert.equal(queries, queriesAfterOptions, "resolve must not re-query when given the period list");

  await service.resolve(request);
  assert.equal(queries, queriesAfterOptions + 1, "resolve still loads the list when given none");
});

test("a user granted only DUB is offered only DUB in the selection options and the resolution carries the budget owner plant", async () => {
  const resolver = new SelectionResolverService(new PeriodWarehouse(["2026-07-01"]));
  const options = await resolver.options(["DUB"]);
  assert.deepEqual(
    options.plants.map(({ value }) => value),
    ["DUB"],
  );
  assert.equal(options.plants[0].provisional, false);
  const resolved = await resolver.resolve({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
  });
  assert.equal(resolved.outcome, "resolved");
  if (resolved.outcome === "resolved") assert.equal(resolved.budgetOwnerPlant, "DUB");
});

test("resolving several plants keeps each plant's triples and leaf targets while one plant keeps the existing resolution", async () => {
  const resolver = new SelectionResolverService(new PeriodWarehouse(["2026-07-01"]));
  const dub = await resolver.resolve({
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
  });
  const onePlant = await resolver.resolvePlants(["DUB"], "2026-07-01");

  assert.deepEqual(onePlant, dub);

  const chir = await resolver.resolve({
    department: "Agriculture",
    function: "Nursery",
    plant: "CHIR",
    period: "2026-07-01",
  });
  const combined = await resolver.resolvePlants(["CHIR", "DUB"], "2026-07-01");
  assert.equal(chir.outcome, "resolved");
  assert.equal(combined.outcome, "resolved");
  assert.ok(combined.outcome === "resolved" && "plants" in combined);
  if (
    dub.outcome !== "resolved" ||
    chir.outcome !== "resolved" ||
    combined.outcome !== "resolved" ||
    !("plants" in combined)
  )
    return;

  assert.deepEqual(
    combined.plants.map(({ plant }) => plant),
    ["CHIR", "DUB"],
  );
  assert.equal(combined.budgetOwnerPlant, "DUB");
  assert.equal(combined.triples.length, dub.triples.length + chir.triples.length);
  assert.equal(
    new Set(combined.triples.map(({ plant, costCenter, glCode }) => `${plant}|${costCenter}|${glCode}`)).size,
    combined.triples.length,
  );
  assert.deepEqual(
    combined.leafTargets
      ?.filter(({ target }) => target.kind === "leaf" && target.leafKey === "8.1|55021000|salaries")
      .map(({ plant }) => plant)
      .sort(),
    ["CHIR", "DUB"],
  );
  assert.deepEqual(
    [
      ...new Set(combined.leafTargets?.filter(({ target }) => target.kind === "bucket").map(({ plant }) => plant)),
    ].sort(),
    ["CHIR", "DUB"],
  );
  assert.deepEqual(await resolver.resolvePlants(["UNKNOWN"], "2026-07-01"), { outcome: "unresolvable" });
});

test("resolving a department function plant and period through the mapping master returns the cost centres the GL set the MIS format and the bucket rows, returns an unresolvable outcome for a selection the master does not cover so the no mapping configured notice never depends on whether the query returned rows, and derives the financial year to date period from the latest active loaded month rather than the wall clock", async () => {
  const resolver = new SelectionResolverService(new PeriodWarehouse(["2026-07-01"]));

  for (const plant of ["DUB", "DUB-NUR", "Agri - Nursery - DUB"]) {
    const resolved = await resolver.resolve({
      department: "Agriculture",
      function: "Nursery",
      plant,
      period: "fy26-27-ytd",
    });
    assert.equal(resolved.outcome, "resolved");
    if (resolved.outcome !== "resolved") continue;
    assert.equal(resolved.plant, "DUB");
    assert.equal(resolved.misFormat, "nursery-mis-financial-v1");
    assert.ok(resolved.costCentres.includes("Primary"));
    assert.ok(resolved.glCodes.includes("50001701"));
    assert.deepEqual(
      resolved.leafTargets?.find(({ costCenter, glCode }) => costCenter === "Primary" && glCode === "50001605")?.target,
      { kind: "leaf", leafKey: "4.5|50001605|fertilizers-manures" },
    );
    assert.deepEqual(
      resolved.leafTargets?.find(({ costCenter, glCode }) => costCenter === "Primary" && glCode === "50001701")?.target,
      { kind: "bucket" },
    );
    assert.equal(resolved.bucketRows.length, 9);
    assert.ok(resolved.bucketRows.every(({ mis_line, reason }) => mis_line === "unmapped-GL" && reason));
    assert.deepEqual(resolved.period, {
      value: "fy26-27-ytd",
      from: "2026-04-01",
      to: "2026-07-01",
    });
  }

  assert.deepEqual(
    await resolver.resolve({ department: "Agriculture", function: "Mill", plant: "DUB", period: "2026-07-01" }),
    { outcome: "unresolvable" },
  );
  assert.deepEqual((await new SelectionResolverService(new PeriodWarehouse([])).options()).periods, []);
  assert.deepEqual(
    (await new SelectionResolverService(new PeriodWarehouse(["2028-01-01"])).options()).periods.map(
      ({ value }) => value,
    ),
    ["2028-01-01"],
  );
  assert.deepEqual(
    (await new SelectionResolverService(new PeriodWarehouse(["2026-07-01", "2028-01-01"])).options()).periods.at(-1),
    { value: "fy26-27-ytd", label: "FY 26-27 YTD", from: "2026-04-01", to: "2027-03-31" },
  );

  const alternateMaster: MappingMaster = {
    ...MAPPING_MASTER,
    selections: [
      {
        ...MAPPING_MASTER.selections[0],
        plant_canonical: "ALT",
        plant_aliases: { sap: ["ALT-SAP"], display: ["Alternate plant"] },
      },
    ],
  };
  const alternate = await new SelectionResolverService(new PeriodWarehouse(["2026-07-01"]), alternateMaster).resolve({
    department: "Agriculture",
    function: "Nursery",
    plant: "ALT",
    period: "2026-07-01",
  });
  assert.equal(alternate.outcome, "resolved");
  if (alternate.outcome === "resolved") assert.ok(alternate.triples.every(({ plant }) => plant === "ALT"));

  const executor = new EmptyExecutor();
  const service = new MisSelectionService(resolver, new SemanticLayer(), executor as unknown as SelectionExecutor);
  const resolvedZero = await service.run(grantedUser, {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
  });
  assert.equal(resolvedZero.outcome, "resolved");
  assert.ok(!("notice" in resolvedZero));
  assert.deepEqual(resolvedZero.totals, { actual: 0, budget: 0, percentage: null });

  const unresolvableZero = await service.run(grantedUser, {
    department: "Agriculture",
    function: "Mill",
    plant: "DUB",
    period: "2026-07-01",
  });
  assert.deepEqual(unresolvableZero, {
    outcome: "unresolvable",
    notice: "No mapping configured",
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "month", label: "Month", numeric: false },
        { key: "actual", label: "Actual", numeric: true },
        { key: "budget", label: "Budget", numeric: true },
        { key: "percentage", label: "%", numeric: true, format: "percent" },
      ],
      rows: [],
    },
    totals: { actual: 0, budget: 0, percentage: null },
    bucketRows: [],
  });

  const unknownPlant = await service.run(grantedUser, {
    department: "Agriculture",
    function: "Nursery",
    plant: "UNKNOWN",
    period: "2026-07-01",
  });
  assert.equal(unknownPlant.outcome, "unresolvable");
  assert.equal(executor.runCalls, 1);
});

class PeriodWarehouse implements Warehouse {
  constructor(private readonly periods: string[]) {}

  async explain(): Promise<void> {}

  async execute(): Promise<QueryResult> {
    return {
      columns: [{ name: "period", numeric: false }],
      rows: this.periods.map((period) => ({ period })),
    };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    return [];
  }
}

class EmptyExecutor {
  runCalls = 0;

  authorize(): void {}

  async run() {
    this.runCalls += 1;
    return {
      result: { columns: [], rows: [] },
      sql: "",
      objectsTouched: [],
      activeBatchIds: [],
      budgetComponentLabels: [],
      rowSourcePresence: [],
    };
  }
}

const grantedUser: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
    dimensionIds: ["gl_code", "month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
