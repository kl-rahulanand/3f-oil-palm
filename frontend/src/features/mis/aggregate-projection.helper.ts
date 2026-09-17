import type { MisStatementMeasureBlock, MisStatementNode, MisStatementResolvedResponse } from "@3f/contract";

export interface AggregateProjectionLine {
  nodeKey: string;
  label: string;
  actual: MisStatementMeasureBlock["actual"];
  glCodes: string[];
  costCentres: string[];
}

export function projectStatementDescendants(
  statement: MisStatementResolvedResponse,
  nodeKey: string,
  block: MisStatementMeasureBlock["key"],
): AggregateProjectionLine[] {
  const roots = nodeKey === statement.grandTotal.nodeKey ? statement.tree : findNode(statement.tree, nodeKey)?.children;
  if (!roots) return [];
  const metadata = new Map(statement.nodeMetadata?.map((entry) => [entry.nodeKey, entry]));
  return flattenLeaves(roots).flatMap((node) => {
    const measure = node.measures.find(({ key }) => key === block);
    if (!measure) return [];
    const mapping = metadata.get(node.nodeKey);
    return [
      {
        nodeKey: node.nodeKey,
        label: node.budgetComponent,
        actual: measure.actual,
        glCodes: mapping?.glCodes ?? [],
        costCentres: mapping?.costCentres ?? [],
      },
    ];
  });
}

function findNode(nodes: MisStatementNode[], nodeKey: string): MisStatementNode | undefined {
  for (const node of nodes) {
    if (node.nodeKey === nodeKey) return node;
    const child = findNode(node.children, nodeKey);
    if (child) return child;
  }
}

function flattenLeaves(nodes: MisStatementNode[]): MisStatementNode[] {
  return nodes.flatMap((node) => (node.children.length ? flattenLeaves(node.children) : [node]));
}
