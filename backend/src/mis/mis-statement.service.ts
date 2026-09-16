import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AuthUser,
  DomainSpec,
  FixedScaleMoney,
  MisStatementRouteResponse,
  MisStatementRunRequest,
  MisStatementMeasureBlock,
  MisStatementNodeMetadata,
  MisStatementNode,
  ProvenanceBatch,
  Selection,
  SourcePresence,
} from "@3f/contract";
import { SelectionExecutionBlockedError, SelectionExecutor } from "../chat/selectionExecutor";
import { loadConfig } from "../config";
import { SelectionPeriodUnavailableError, SelectionResolverService } from "../mapping/selection-resolver.service";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { SemanticLayer } from "../semantic/semanticLayer";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import type { IStatementOutlineRepository, StatementOutlineNode } from "../warehouse/statement-outline.interface";
import type {
  IMisStatementDrillSupport,
  IMisStatementService,
  MisStatementBlockDefinition,
} from "./mis-statement.interface";
import { misStatementResponseSchema } from "./mis-statement.dto";
import { StatementAttestationService } from "./statement-attestation";

const FY_START = "2026-04-01";
const MEASURE_IDS = [
  "mis-statement.actual_net",
  "mis-statement.budget_net",
  "mis-statement.rollover_net",
  "mis-statement.percentage",
];
const SOURCE_ORDER: SourcePresence[] = ["matched", "budget-only", "actual-only"];

interface Amounts {
  actual: bigint;
  budget: bigint;
  labels: string[];
  sourcePresence: SourcePresence[];
}

interface BlockResult {
  definition: Pick<MisStatementMeasureBlock, "key" | "label" | "from" | "to">;
  byLeaf: Map<string, Amounts>;
  activeBatchIds: ProvenanceBatch[];
  budgetState: "loaded" | "not-loaded";
}

interface MutableNode extends StatementOutlineNode {
  amounts: Amounts[];
  children: MutableNode[];
}

@Injectable()
export class MisStatementService implements IMisStatementService, IMisStatementDrillSupport {
  constructor(
    @Inject(SelectionResolverService) private readonly resolver: ISelectionResolverService,
    private readonly semantic: SemanticLayer,
    private readonly executor: SelectionExecutor,
    @Inject(StatementOutlineRepository) private readonly outlines: IStatementOutlineRepository,
    private readonly attestation: StatementAttestationService,
  ) {}

  async run(user: AuthUser, request: MisStatementRunRequest): Promise<MisStatementRouteResponse> {
    const { domain, selection } = this.authorize(user);
    const canonicalPlant = this.resolver.canonicalPlant(request.plant);
    if (canonicalPlant && !plantScope(user).includes(canonicalPlant)) {
      throw new SelectionExecutionBlockedError("MIS statement plant scope is not authorized");
    }

    let resolution;
    try {
      resolution = await this.resolver.resolve(request);
    } catch (error) {
      if (error instanceof SelectionPeriodUnavailableError) throw new BadRequestException(error.message);
      throw error;
    }
    if (resolution.outcome === "unresolvable") {
      return misStatementResponseSchema.parse({
        outcome: "unresolvable",
        notice: "No mapping configured",
        tree: [],
        grandTotal: null,
        provenance: { activeBatchIds: [] },
      });
    }

    const outline = await this.outlines.findActiveBudgetOutline(resolution.period.to);
    const blocks = await Promise.all(
      this.blocks(resolution).map((definition) => this.executeBlock(user, domain, selection, resolution, definition)),
    );
    const currentOutline = await this.outlines.findActiveBudgetOutline(resolution.period.to);
    const blockBudgetMismatch = blocks.some((block) =>
      block.activeBatchIds.some(
        ({ source, period, batchId }) =>
          source === "budget" && period === resolution.period.to && batchId !== outline.batchId,
      ),
    );
    if (currentOutline.batchId !== outline.batchId || blockBudgetMismatch) {
      return misStatementResponseSchema.parse({
        outcome: "refresh-required",
        notice: "The data was refreshed - ask again",
      });
    }
    const { tree, grandTotal } = buildTree(outline.nodes, blocks);
    const activeBatchIds = uniqueBatches([
      ...blocks.flatMap((block) => block.activeBatchIds),
      { source: "budget", period: resolution.period.to, batchId: outline.batchId },
    ]);
    if (request.pinnedBatches && !batchesStillActive(request.pinnedBatches, activeBatchIds)) {
      return misStatementResponseSchema.parse({
        outcome: "refresh-required",
        notice: "The data was refreshed - ask again",
      });
    }
    const nodeMetadata = buildNodeMetadata(outline.nodes, resolution);
    const attestedContext = this.attestation.issue({
      department: resolution.department,
      function: resolution.function,
      plant: resolution.plant,
      period: resolution.period.value,
      outline: outline.nodes,
      blocks: blocks.map(({ definition }) => definition.key),
      nodeMetadata,
      pinnedBatches: activeBatchIds,
      mappingMasterVersion: MAPPING_MASTER.version,
      userId: user.id,
    });
    return misStatementResponseSchema.parse({
      outcome: "resolved",
      scope: {
        department: resolution.department,
        function: resolution.function,
        plant: resolution.plant,
        plantDisplay: resolution.plantDisplay,
        provisional: resolution.provisional,
        period: resolution.period.value,
        costCentres: resolution.costCentres,
        glCodes: resolution.glCodes,
        misFormat: resolution.misFormat,
      },
      tree,
      grandTotal,
      provenance: { activeBatchIds },
      attestedContext,
      nodeMetadata,
    });
  }

  authorize(user: AuthUser): { domain: DomainSpec; selection: Selection } {
    const selection: Selection = {
      domain: "mis-statement",
      measureIds: [...MEASURE_IDS],
      dimensionIds: ["leaf_key"],
      filters: [],
    };
    const domain = this.semantic.domain(selection.domain);
    if (!domain) throw new Error("MIS statement domain is not configured");
    this.executor.authorize(user, domain, selection);
    return { domain, selection };
  }

  blocks(resolution: MasterResolvedSelection): MisStatementBlockDefinition[] {
    return blockDefinitions(resolution);
  }

  private async executeBlock(
    user: AuthUser,
    domain: DomainSpec,
    selection: Selection,
    resolution: MasterResolvedSelection,
    definition: BlockResult["definition"],
  ): Promise<BlockResult> {
    const execution = await this.executor.run(
      user,
      domain,
      {
        ...selection,
        timeWindow: { grain: "month", column: "month", from: definition.from, to: definition.to },
      },
      {
        includeTotals: false,
        resolvedScope: {
          triples: resolution.triples,
          glCodes: resolution.glCodes,
          masterGlCodes: resolution.masterGlCodes,
          leafTargets: resolution.leafTargets,
        },
      },
    );
    if (execution.result.rows.length >= loadConfig().maxRows) {
      throw new SelectionExecutionBlockedError("MIS statement exceeded the configured row limit");
    }
    const budgetLoaded = resolution.plant === resolution.budgetOwnerPlant;
    const byLeaf = new Map<string, Amounts>();
    execution.result.rows.forEach((row, index) => {
      if (typeof row.leaf_key !== "string") return;
      const current = byLeaf.get(row.leaf_key) ?? emptyAmounts();
      current.actual += toPaise(row.actual_net);
      if (budgetLoaded) {
        current.budget += toPaise(row.budget_net);
        if (typeof row.percentage === "string" && !isNumeric(row.percentage)) current.labels.push(row.percentage);
      }
      current.sourcePresence = mergePresence(
        current.sourcePresence,
        budgetLoaded ? execution.rowSourcePresence[index] : "actual-only",
      );
      byLeaf.set(row.leaf_key, current);
    });
    return {
      definition,
      byLeaf,
      activeBatchIds: execution.activeBatchIds,
      budgetState: budgetLoaded ? "loaded" : "not-loaded",
    };
  }
}

function blockDefinitions(resolution: MasterResolvedSelection): BlockResult["definition"][] {
  if (resolution.period.value === "fy26-27-ytd") {
    return [{ key: "fy26-27-ytd", label: "FY 26-27 YTD", from: resolution.period.from, to: resolution.period.to }];
  }
  const selected: BlockResult["definition"] = {
    key: "selected",
    label: resolution.period.value,
    from: resolution.period.from,
    to: resolution.period.to,
  };
  const ytd: BlockResult["definition"] = {
    key: "fy26-27-ytd",
    label: "FY 26-27 YTD",
    from: FY_START,
    to: resolution.period.to,
  };
  return selected.from === ytd.from && selected.to === ytd.to ? [selected] : [selected, ytd];
}

function buildTree(outline: StatementOutlineNode[], blocks: BlockResult[]) {
  const nodes = new Map<string, MutableNode>();
  for (const row of outline) {
    nodes.set(row.nodeKey, {
      ...row,
      amounts: blocks.map(({ byLeaf }) => (row.leafKey ? copyAmounts(byLeaf.get(row.leafKey)) : emptyAmounts())),
      children: [],
    });
  }
  const roots: MutableNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentKey ? nodes.get(node.parentKey) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const node of [...nodes.values()].reverse()) {
    if (node.children.length) node.amounts = blocks.map((_, index) => sumAmounts(node.children, index));
  }

  if (blocks.some(({ byLeaf }) => byLeaf.has("unmapped-GL"))) {
    roots.push({
      nodeKey: "unmapped-GL",
      parentKey: null,
      depth: 0,
      sNo: null,
      label: "unmapped-GL",
      sortOrder: Number.MAX_SAFE_INTEGER,
      glCode: null,
      leafKey: "unmapped-GL",
      amounts: blocks.map(({ byLeaf }) => copyAmounts(byLeaf.get("unmapped-GL"))),
      children: [],
    });
  }
  const grandAmounts = blocks.map((_, index) => sumAmounts(roots, index));
  return {
    tree: roots.map((node) => toWireNode(node, blocks)),
    grandTotal: toWireNode(
      {
        nodeKey: "grand-total",
        parentKey: null,
        depth: 0,
        sNo: null,
        label: "Grand Total",
        sortOrder: Number.MAX_SAFE_INTEGER,
        glCode: null,
        leafKey: null,
        amounts: grandAmounts,
        children: [],
      },
      blocks,
    ),
  };
}

function toWireNode(node: MutableNode, blocks: BlockResult[]): MisStatementNode {
  return {
    nodeKey: node.nodeKey,
    sNo: node.sNo,
    budgetComponent: node.label,
    glCode: node.glCode,
    measures: blocks.map(({ definition, budgetState }, index) =>
      toMeasureBlock(definition, node.amounts[index], budgetState),
    ),
    children: node.children.map((child) => toWireNode(child, blocks)),
  };
}

function toMeasureBlock(
  definition: BlockResult["definition"],
  amounts: Amounts = emptyAmounts(),
  budgetState: BlockResult["budgetState"] = "loaded",
): MisStatementMeasureBlock {
  if (budgetState === "not-loaded") {
    return {
      ...definition,
      budgetState,
      budget: null,
      rollover: null,
      actual: formatMoney(amounts.actual),
      percentage: null,
      sourcePresence: amounts.sourcePresence,
    };
  }
  return {
    ...definition,
    budgetState,
    budget: formatMoney(amounts.budget),
    rollover: null,
    actual: formatMoney(amounts.actual),
    percentage: percentage(amounts),
    sourcePresence: amounts.sourcePresence,
  };
}

function emptyAmounts(): Amounts {
  return { actual: 0n, budget: 0n, labels: [], sourcePresence: [] };
}

function copyAmounts(amounts: Amounts | undefined): Amounts {
  return amounts
    ? { ...amounts, labels: [...amounts.labels], sourcePresence: [...amounts.sourcePresence] }
    : emptyAmounts();
}

function sumAmounts(nodes: MutableNode[], index: number): Amounts {
  return nodes.reduce((total, node) => {
    const amount = node.amounts[index] ?? emptyAmounts();
    total.actual += amount.actual;
    total.budget += amount.budget;
    total.sourcePresence = mergePresence(total.sourcePresence, amount.sourcePresence);
    return total;
  }, emptyAmounts());
}

function toPaise(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Statement projection returned an invalid money value");
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -amount : amount;
}

function formatMoney(value: bigint): FixedScaleMoney {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}` as FixedScaleMoney;
}

function percentage({ actual, budget, labels }: Amounts): string | null {
  if (budget === 0n) {
    const label = labels.find((value) => !isNumeric(value));
    if (label) return label;
    if (actual === 0n) return null;
    return actual > 0n ? "over-budget" : "credit / negative actual";
  }
  const scale = 1_000_000n;
  const negative = actual * budget < 0n;
  const quotient = ((actual < 0n ? -actual : actual) * scale) / (budget < 0n ? -budget : budget);
  const whole = quotient / scale;
  const fraction = String(quotient % scale)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function mergePresence(left: SourcePresence[], right: SourcePresence | SourcePresence[] | undefined): SourcePresence[] {
  const values = Array.isArray(right) ? right : right ? [right] : [];
  return SOURCE_ORDER.filter((value) => left.includes(value) || values.includes(value));
}

function uniqueBatches(values: ProvenanceBatch[]): ProvenanceBatch[] {
  return [...new Map(values.map((value) => [`${value.source}\0${value.period}\0${value.batchId}`, value])).values()];
}

function batchesStillActive(requested: ProvenanceBatch[], active: ProvenanceBatch[]): boolean {
  const activeKeys = new Set(active.map(({ source, period, batchId }) => `${source}\0${period}\0${batchId}`));
  return requested.every(({ source, period, batchId }) => activeKeys.has(`${source}\0${period}\0${batchId}`));
}

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}

function buildNodeMetadata(
  outline: StatementOutlineNode[],
  resolution: MasterResolvedSelection,
): MisStatementNodeMetadata[] {
  const leafTargets = new Map<string, NonNullable<MasterResolvedSelection["leafTargets"]>>();
  for (const target of resolution.leafTargets ?? []) {
    if (target.target.kind !== "leaf") continue;
    const targets = leafTargets.get(target.target.leafKey) ?? [];
    targets.push(target);
    leafTargets.set(target.target.leafKey, targets);
  }
  return outline
    .filter(({ leafKey }) => leafKey !== null)
    .map(({ nodeKey, leafKey }) => {
      const targets = leafTargets.get(leafKey!) ?? [];
      return {
        nodeKey,
        glCodes: unique(targets.map(({ glCode }) => glCode)),
        costCentres: unique(targets.map(({ costCenter }) => costCenter)),
      };
    });
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
