import type { FixedScaleMoney, MisStatementResolvedResponse } from "@3f/contract";
import { expect, test } from "vitest";
import { projectStatementDescendants } from "./aggregate-projection.helper";

test("an aggregate explanation projects descendant lines with their values from the rendered statement", () => {
  const statement = fixture();

  expect(projectStatementDescendants(statement, "materials", "selected")).toEqual([
    {
      nodeKey: "shade",
      label: "Shade Net",
      actual: "5.00",
      glCodes: ["5001"],
      costCentres: ["Primary"],
    },
    {
      nodeKey: "diesel",
      label: "Diesel",
      actual: "10.00",
      glCodes: ["5002"],
      costCentres: ["Workshop"],
    },
  ]);
});

function fixture(): MisStatementResolvedResponse {
  const measure = (actual: string) => ({
    key: "selected" as const,
    label: "July 2026",
    from: "2026-07-01",
    to: "2026-07-01",
    budgetState: "loaded" as const,
    budget: "20.00" as const,
    rollover: null,
    actual: actual as FixedScaleMoney,
    percentage: "0.5",
    sourcePresence: ["matched" as const],
  });
  return {
    outcome: "resolved",
    scope: {
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
      costCentres: ["Primary"],
      glCodes: ["5001", "5002"],
      misFormat: "nursery-mis-financial-v1",
    },
    tree: [
      {
        nodeKey: "materials",
        sNo: "4",
        budgetComponent: "Materials",
        glCode: null,
        measures: [measure("15.00")],
        children: [
          {
            nodeKey: "shade",
            sNo: "4.1",
            budgetComponent: "Shade Net",
            glCode: "5001",
            measures: [measure("5.00")],
            children: [],
          },
          {
            nodeKey: "vehicle",
            sNo: "4.2",
            budgetComponent: "Vehicle",
            glCode: null,
            measures: [measure("10.00")],
            children: [
              {
                nodeKey: "diesel",
                sNo: null,
                budgetComponent: "Diesel",
                glCode: "5002",
                measures: [measure("10.00")],
                children: [],
              },
            ],
          },
        ],
      },
    ],
    grandTotal: {
      nodeKey: "grand-total",
      sNo: null,
      budgetComponent: "Grand Total",
      glCode: null,
      measures: [measure("15.00")],
      children: [],
    },
    provenance: { activeBatchIds: [] },
    nodeMetadata: [
      { nodeKey: "shade", glCodes: ["5001"], costCentres: ["Primary"] },
      { nodeKey: "diesel", glCodes: ["5002"], costCentres: ["Workshop"] },
    ],
  };
}
