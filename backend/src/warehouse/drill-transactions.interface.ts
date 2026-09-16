import type { MisDrillFooter, MisDrillLine, ProvenanceBatch } from "@3f/contract";

export interface DrillBatch extends ProvenanceBatch {
  isActive: boolean;
}

export interface DrillPredicate {
  actualBatchIds: string[];
  triples: Array<{ plant: string; costCenter: string; glCode: string }>;
  plants: string[];
  from: string;
  to: string;
}

export interface DrillQueries {
  pageSql: string;
  footerSql: string;
  objectsTouched: string[];
}

export interface DrillReadResult {
  lines: MisDrillLine[];
  footer: MisDrillFooter;
  totalCount: number;
}

export interface IDrillTransactionsRepository {
  findBatchStates(pins: ProvenanceBatch[]): Promise<DrillBatch[]>;
  findActualPeriods(from: string, to: string): Promise<string[]>;
  buildQueries(predicate: DrillPredicate, page: number, rowLimit?: number): DrillQueries;
  execute(queries: DrillQueries): Promise<DrillReadResult>;
}
