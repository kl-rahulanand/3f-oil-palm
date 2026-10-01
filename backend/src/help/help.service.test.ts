import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "@3f/contract";
import { SemanticLayer } from "../semantic/semanticLayer";
import { HelpService } from "./help.service";

test("help lists measure comparison filter examples using permitted labels and Indian grouping", async () => {
  const service = new HelpService(new SemanticLayer(), { values: async () => [] } as never);

  const response = await service.build(financeUser());

  assert.deepEqual(
    response.whatYouCanAsk.filterExamples.find(({ dimensionLabel }) => dimensionLabel === "Measure comparisons"),
    {
      dimensionLabel: "Measure comparisons",
      values: ["Actual > Budget", "Actual > ₹5,00,000"],
    },
  );
});

function financeUser(): AuthUser {
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["admin"],
    permissions: {
      actions: ["report"],
      domains: ["governed-financial"],
      measureIds: ["governed-financial.actual", "governed-financial.budget"],
      dimensionIds: ["gl_code"],
    },
    scope: [{ attribute: "plant", value: "DUB" }],
  };
}
