import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "@3f/contract";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { canonicalPlantFromMaster, MAPPING_MASTER, UNMAPPED_GL_LINE } from "../mapping/mapping-master";
import type { ISelectionResolverService } from "../mapping/selection-resolver.interface";
import { MisSelectionService } from "../mis/mis-selection.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { createWarehouseDb, createWarehouseWritePool, IngestionRepository } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";

const PERIOD = "2099-11-01";

test("the destructive selection slice proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves a cost centre filtered selection returns one exact row per gl code and month without fan out excludes a master covered gl outside the selection and attributes a budget gl absent from the master to the unmapped GL line",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const repository = new IngestionRepository(createWarehouseDb(pool));
      await repository.replaceActualsBatch(metadata("actuals"), [
        actualRow("SELECTED", "Primary", "100.00"),
        actualRow("OTHER-COST-CENTRE", "Admin", "25.00"),
      ]);
      const budgetRows = [
        budgetRow("SELECTED", "50001701", "200.00"),
        budgetRow("OUTSIDE", "50001201", "300.00"),
        budgetRow("UNKNOWN", "99999999", "50.00"),
      ];
      await repository.replaceBudgetBatch(metadata("budget"), budgetRows, budgetOutline(budgetRows));

      const masterGlCodes = [
        ...new Set(
          MAPPING_MASTER.selections.flatMap((masterSelection) => [
            ...masterSelection.entries.map(({ gl_code }) => gl_code),
            ...masterSelection.budget_gl_codes,
          ]),
        ),
      ];
      const resolver: ISelectionResolverService = {
        options: async () => ({ departments: [], functions: [], plants: [], periods: [] }),
        canonicalPlant: (plant) => canonicalPlantFromMaster(plant, MAPPING_MASTER),
        resolve: async () => ({
          outcome: "resolved" as const,
          department: "Agriculture",
          function: "Nursery",
          plant: "DUB",
          plantDisplay: "Agri - Nursery - DUB",
          provisional: false,
          budgetOwnerPlant: "DUB",
          costCentres: ["Primary"],
          glCodes: ["50001701"],
          misFormat: "nursery-mis-financial-v1",
          bucketRows: [],
          triples: [{ plant: "DUB", costCenter: "Primary", glCode: "50001701" }],
          masterGlCodes,
          period: { value: PERIOD, from: PERIOD, to: PERIOD },
        }),
      };
      const service = new MisSelectionService(
        resolver,
        new SemanticLayer(),
        new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new PostgresAdapter()),
      );
      const response = await service.run(user, {
        department: "Agriculture",
        function: "Nursery",
        plant: "DUB",
        period: PERIOD,
      });
      assert.equal(response.outcome, "resolved");
      if (response.outcome !== "resolved") return;
      const values = response.result.rows
        .map(({ gl_code, month, actual, budget }) => ({
          gl_code,
          month: dateOnly(month),
          actual,
          budget,
        }))
        .sort((left, right) => String(left.gl_code).localeCompare(String(right.gl_code)));

      assert.deepEqual(values, [
        { gl_code: "50001701", month: PERIOD, actual: "100.00", budget: "200.00" },
        { gl_code: "99999999", month: PERIOD, actual: "0.00", budget: "50.00" },
      ]);
      assert.equal(new Set(values.map(({ gl_code, month }) => `${gl_code}\0${month}`)).size, values.length);
      assert.ok(!values.some(({ gl_code }) => gl_code === "50001201"));
      assert.ok(
        response.bucketRows.some(({ glCode, misLine }) => glCode === "99999999" && misLine === UNMAPPED_GL_LINE),
      );
    } finally {
      await pool.end();
    }
  },
);

const user: AuthUser = {
  id: "proof-user",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: {
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
    dimensionIds: ["gl_code", "month"],
    actions: ["report"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};

function metadata(fixture: string) {
  return {
    period: PERIOD,
    uploadedBy: "selection-slice-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture },
  };
}

function actualRow(txnNo: string, costCenter: string, debit: string) {
  return {
    txnNo,
    lineId: "1",
    postingDate: "2099-11-07",
    month: PERIOD,
    plant: "DUB",
    plantSrc: "DUB-NUR",
    costCenter,
    glCode: "50001701",
    acctName: "Selection slice proof",
    debit,
    credit: "0.00",
  };
}

function budgetRow(lineId: string, glCode: string, budgetAmount: string) {
  return {
    formatId: "nursery",
    period: PERIOD,
    lineId,
    leafKey: lineId,
    glCode,
    costCenter: lineId,
    budgetAmount,
    rolloverAmount: "0.00",
  };
}

function budgetOutline(rows: ReturnType<typeof budgetRow>[]) {
  return rows.map(({ lineId, leafKey, costCenter: label, glCode }, sortOrder) => ({
    nodeKey: `leaf:${leafKey}`,
    depth: 0,
    label,
    sortOrder,
    glCode,
    leafKey,
  }));
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive selection slice setup",
  );
}

function dateOnly(value: string | number | null): string | number | null {
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
    .join("-");
}
