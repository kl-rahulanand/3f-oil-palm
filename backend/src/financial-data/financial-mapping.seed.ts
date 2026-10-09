import { z } from "zod";
import { MAPPING_MASTER, selectionAliases } from "../mapping/mapping-master";
import { financialIssue, financialValidationError } from "./financial-workbook.parser";
import { FINANCIAL_BUDGET_OWNER, type FinancialBudgetComponent } from "./financial-budget.parser";

export interface FinancialMappingSeedEntry {
  plantCode: string;
  sourcePlantAliases: string[];
  costCenterCode: string;
  glCode: string;
  targetComponentKey: string;
  approvalStatus: "approved" | "provisional";
  approvalReason: string | null;
  approvedBy: string;
  provenance: string;
}

const dubSelection = MAPPING_MASTER.selections.find(({ plant_canonical }) => plant_canonical === "DUB");
if (!dubSelection) throw new Error("The governed mapping master has no DUB selection");

export const FINANCIAL_MAPPING_SEED: readonly FinancialMappingSeedEntry[] = dubSelection.entries.flatMap((entry) =>
  entry.target?.kind === "leaf"
    ? [
        {
          plantCode: dubSelection.plant_canonical,
          sourcePlantAliases: selectionAliases(dubSelection).filter((alias) => alias !== dubSelection.plant_canonical),
          costCenterCode: entry.cost_center,
          glCode: entry.gl_code,
          targetComponentKey: entry.target.leaf_key,
          approvalStatus: entry.provisional ? ("provisional" as const) : ("approved" as const),
          approvalReason: entry.reason ?? null,
          approvedBy: "provisional-seed",
          provenance: MAPPING_MASTER.source,
        },
      ]
    : [],
);

export function validateFinancialMappingSeed(
  entries: readonly FinancialMappingSeedEntry[],
  components: readonly FinancialBudgetComponent[],
  declaredBudgetOwner: string,
): FinancialMappingSeedEntry[] {
  const issues: z.ZodIssue[] = [];
  const leaves = components.filter(({ isLeaf }) => isLeaf).map(({ componentKey }) => componentKey);
  const tuples = new Set<string>();
  if (declaredBudgetOwner !== FINANCIAL_BUDGET_OWNER) {
    issues.push(financialIssue(["file", "budgetOwner"], "Budget owner must be DUB"));
  }
  const normalized = entries.map((entry, index) => {
    if (entry.plantCode !== FINANCIAL_BUDGET_OWNER || entry.plantCode !== declaredBudgetOwner) {
      issues.push(financialIssue(["mappings", index, "plantCode"], "Mapping Plant must own the Budget"));
    }
    const tuple = [entry.plantCode, entry.costCenterCode, entry.glCode].join("\0");
    if (tuples.has(tuple)) {
      issues.push(financialIssue(["mappings", index], "Mapping tuple has multiple targets"));
    }
    tuples.add(tuple);
    const targets = leaves.filter(
      (componentKey) =>
        componentKey === entry.targetComponentKey || componentKey.endsWith(`/${entry.targetComponentKey}`),
    );
    if (targets.length !== 1) {
      issues.push(financialIssue(["mappings", index, "targetComponentKey"], "Mapping target is not a Budget leaf"));
    }
    if (entry.approvalStatus === "provisional" && !entry.approvalReason?.trim()) {
      issues.push(financialIssue(["mappings", index, "approvalReason"], "Provisional mapping requires a reason"));
    }
    return targets.length === 1 ? { ...entry, targetComponentKey: targets[0]! } : entry;
  });
  if (issues.length) throw financialValidationError(issues);
  return normalized;
}
