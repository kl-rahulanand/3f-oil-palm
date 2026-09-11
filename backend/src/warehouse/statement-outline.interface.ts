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
  findByBudgetPeriod(period: string): Promise<StatementOutlineNode[]>;
}
