export interface StatementOutlineNode {
  nodeKey: string;
  parentKey: string | null;
  depth: number;
  sNo: string | null;
  label: string;
  sortOrder: number;
  glCode: string | null;
  leafKey: string | null;
}

export interface IStatementOutlineRepository {
  findActiveBudgetOutline(period: string): Promise<{ batchId: string; nodes: StatementOutlineNode[] }>;
}

export interface IPinnedStatementOutlineRepository {
  findByBudgetPeriod(period: string): Promise<StatementOutlineNode[]>;
  findByBudgetBatchId(batchId: string): Promise<StatementOutlineNode[]>;
}
