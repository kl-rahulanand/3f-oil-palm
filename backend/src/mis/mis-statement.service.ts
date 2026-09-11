import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AuthUser,
  DomainSpec,
  FixedScaleMoney,
  MisSelectionRunRequest,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementRunResponse,
  ProvenanceBatch,
  Selection,
  SourcePresence,
} from "@3f/contract";
import { SelectionExecutionBlockedError, SelectionExecutor } from "../chat/selectionExecutor";
import { loadConfig } from "../config";
import { SelectionPeriodUnavailableError, SelectionResolverService } from "../mapping/selection-resolver.service";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { SemanticLayer } from "../semantic/semanticLayer";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import type { IStatementOutlineRepository, StatementOutlineNode } from "../warehouse/statement-outline.interface";
import type { IMisStatementService } from "./mis-statement.interface";

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
}

interface MutableNode extends StatementOutlineNode {
  amounts: Amounts[];
  children: MutableNode[];
}

@Injectable()
export class MisStatementService implements IMisStatementService {
  constructor(
    @Inject(SelectionResolverService) private readonly resolver: ISelectionResolverService,
    private readonly semantic: SemanticLayer,
    private readonly executor: SelectionExecutor,
    @Inject(StatementOutlineRepository) private readonly outlines: IStatementOutlineRepository,
  ) {}

  async run(user: AuthUser, request: MisSelectionRunRequest): Promise<MisStatementRunResponse> {
    const { domain, selection } = this.authorizedSelection(user);
    this.executor.authorize(user, domain, selection);
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
      return {
        outcome: "unresolvable",
        notice: "No mapping configured",
        tree: [],
        grandTotal: null,
        provenance: { activeBatchIds: [] },
      };
    }

    const blocks = await Promise.all(
      blockDefinitions(resolution).map((definition) =>
        this.executeBlock(user, domain, selection, resolution, definition),
      ),
    );
    const outline = await this.outlines.findByBudgetPeriod(resolution.period.to);
    const { tree, grandTotal } = buildTree(outline, blocks);
    return {
      outcome: "resolved",
      scope: {
        department: resolution.department,
        function: resolution.function,
        plant: resolution.plant,
        period: resolution.period.value,
        costCentres: resolution.costCentres,
        glCodes: resolution.glCodes,
        misFormat: resolution.misFormat,
      },
      tree,
      grandTotal,
      provenance: { activeBatchIds: uniqueBatches(blocks.flatMap(({ activeBatchIds }) => activeBatchIds)) },
    };
  }

  private authorizedSelection(user: AuthUser): { domain: DomainSpec; selection: Selection } {
    const selection: Selection = {
      domain: "mis-statement",
      measureIds: [...MEASURE_IDS],
      dimensionIds: ["leaf_key", "month"],
      filters: [],
    };
    const domain = this.semantic.domain(selection.domain);
    if (!domain) throw new Error("MIS statement domain is not configured");
    return { domain, selection };
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
        dimensionIds: [],
        timeWindow: { grain: "month", column: "month", from: definition.from, to: definition.to },
      },
      {
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
    const byLeaf = new Map<string, Amounts>();
    execution.result.rows.forEach((row, index) => {
      if (typeof row.leaf_key !== "string") return;
      const current = byLeaf.get(row.leaf_key) ?? emptyAmounts();
      current.actual += toPaise(row.actual_net);
      current.budget += toPaise(row.budget_net);
      if (typeof row.percentage === "string" && !isNumeric(row.percentage)) current.labels.push(row.percentage);
      current.sourcePresence = mergePresence(current.sourcePresence, execution.rowSourcePresence[index]);
      byLeaf.set(row.leaf_key, current);
    });
    return { definition, byLeaf, activeBatchIds: execution.activeBatchIds };
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
    measures: blocks.map(({ definition }, index) => toMeasureBlock(definition, node.amounts[index])),
    children: node.children.map((child) => toWireNode(child, blocks)),
  };
}

function toMeasureBlock(
  definition: BlockResult["definition"],
  amounts: Amounts = emptyAmounts(),
): MisStatementMeasureBlock {
  return {
    ...definition,
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

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}
