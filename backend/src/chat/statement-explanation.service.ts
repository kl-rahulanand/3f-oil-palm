import { Inject, Injectable } from "@nestjs/common";
import type { AskStatementGrounding, AuthUser, StatementGroundingResponse } from "@3f/contract";
import type { IMisDrillService, MisDrillReadResponse } from "../mis/mis-drill.interface";
import { MisDrillService } from "../mis/mis-drill.service";
import { StatementGroundingService } from "./statement-grounding.service";
import { classifyStatementIntent } from "./statement-intent";

export type StatementExplanationDecision =
  { kind: "data" } | { kind: "causal" } | { kind: "response"; response: StatementGroundingResponse };

@Injectable()
export class StatementExplanationService {
  constructor(
    private readonly grounding: StatementGroundingService,
    @Inject(MisDrillService) private readonly drills: IMisDrillService,
  ) {}

  async explain(
    user: AuthUser,
    sessionId: string,
    question: string,
    grounding: AskStatementGrounding,
  ): Promise<StatementExplanationDecision> {
    const intent = classifyStatementIntent(question);
    if (intent === "data") return { kind: "data" };
    if (intent === "causal") return { kind: "causal" };
    if (grounding.focus?.subject === "budget") {
      return { kind: "response", response: { outcome: "refused", reason: "budget-subject-not-supported" } };
    }
    const verified = await this.grounding.verify(user, grounding);
    if (verified.outcome === "refused") return { kind: "response", response: verified };
    if (verified.outcome === "gone") {
      return {
        kind: "response",
        response: { outcome: "gone", batchStatuses: verified.batchStatuses, message: "A pinned batch is gone." },
      };
    }
    if (!grounding.focus) return { kind: "response", response: { outcome: "focus-required" } };
    if (!verified.context.leafKey) {
      return {
        kind: "response",
        response: {
          outcome: "aggregate",
          nodeKey: grounding.focus.nodeKey,
          block: grounding.focus.block,
          budgetState: verified.context.budgetState,
          instruction: "project-descendants-from-attested-statement",
        },
      };
    }
    const read = await this.drills.read(user, sessionId, verified.context, 20);
    if (read.outcome === "audit-failed") {
      return {
        kind: "response",
        response: { outcome: "audit-failure", message: "The explanation could not be safely audited." },
      };
    }
    if (read.outcome === "gone") {
      return {
        kind: "response",
        response: { outcome: "gone", batchStatuses: read.batchStatuses, message: read.message },
      };
    }
    if (read.outcome === "refused") {
      return {
        kind: "response",
        response: { outcome: "refused", reason: "pinned-batch-invalid", batchStatuses: read.batchStatuses },
      };
    }
    const explanation = leaf(read.response, grounding.focus.block);
    if (read.outcome === "replaced") {
      const replacedBatches = read.response.batchStatuses.filter(({ status }) => status === "replaced");
      return {
        kind: "response",
        response: {
          outcome: "replaced",
          ...explanation,
          replacedBatches,
          notice: replacedBatches.map(({ source, period }) => `${source} ${period} was replaced`).join("; "),
        },
      };
    }
    return { kind: "response", response: { outcome: "leaf", ...explanation } };
  }
}

function leaf(response: MisDrillReadResponse, block: "selected" | "fy26-27-ytd") {
  return {
    nodeKey: response.nodeKey,
    leafKey: response.leafKey,
    block,
    budgetState: response.budgetState,
    rollup: response.rollup,
    transactions: {
      lines: response.lines,
      footer: response.footer,
      totalCount: response.totalCount,
      pageSize: 20 as const,
    },
  };
}
