import type { FixedScaleMoney, MisDrillFooter, MisDrillLine, ProvenanceBatch, SelectionFilter } from "@3f/contract";

export interface DrillBatch extends ProvenanceBatch {
  isActive: boolean;
}

interface DrillPredicateBase {
  actualBatchIds: string[];
  plants: string[];
  from: string;
  to: string;
  triples?: Array<{ plant: string; costCenter: string; glCode: string }>;
}

export type DrillPredicate =
  | (DrillPredicateBase & {
      mode?: "triples";
      triples: Array<{ plant: string; costCenter: string; glCode: string }>;
    })
  | (DrillPredicateBase & {
      mode: "gl-and-plants";
      glCode: string;
      filters: SelectionFilter[];
    });

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

export interface DrillSummary {
  rowKey: string;
  feedingLineCount: number;
  value: FixedScaleMoney;
}

export interface IDrillTransactionsRepository {
  findBatchStates(pins: ProvenanceBatch[]): Promise<DrillBatch[]>;
  findActualPeriods(from: string, to: string): Promise<string[]>;
  buildQueries(predicate: DrillPredicate, page: number, rowLimit: number): DrillQueries;
  execute(queries: DrillQueries): Promise<DrillReadResult>;
  summarize(rows: Array<{ rowKey: string; predicate: DrillPredicate }>): Promise<DrillSummary[]>;
}
