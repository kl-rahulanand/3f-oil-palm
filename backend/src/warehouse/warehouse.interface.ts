// Generic-ready seam #2 (eng review). StarRocks is the only impl in V1; a future DB
// = a new adapter. Warehouse specifics never leak into orchestration.

export interface QueryResult {
  columns: { name: string; numeric: boolean }[];
  rows: Array<Record<string, string | number | null>>;
}

export interface Warehouse {
  /** Read-only EXPLAIN guard before execution. Throws on plan failure. */
  explain(sql: string): Promise<void>;
  /** Execute validated, read-only SQL. Enforces timeout upstream. */
  execute(sql: string): Promise<QueryResult>;
  /** Freshness watermark for a gold object (data-as-of), or null if unknown. */
  freshness(goldObject: string, column?: string): Promise<string | null>;
  /** Distinct values of a column — used to validate admin-set scope values (B3). */
  distinctValues(goldObject: string, column: string): Promise<string[]>;
}
