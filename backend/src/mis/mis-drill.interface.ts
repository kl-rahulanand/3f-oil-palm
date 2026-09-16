import { HttpException } from "@nestjs/common";
import type {
  AuthUser,
  MisDrillBatchStatus,
  MisDrillRequest,
  MisDrillResponse,
  MisStatementMeasureBlock,
  ProvenanceBatch,
  StatementRollupEntry,
} from "@3f/contract";
import type { MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import type { StatementOutlineNode } from "../warehouse/statement-outline.interface";

export interface MisDrillPreparationRequest {
  department: string;
  function: string;
  plant: string;
  period: string;
  pinnedBatches: ProvenanceBatch[];
  focus?: { nodeKey: string; block: MisStatementMeasureBlock["key"] };
  page: number;
}

export interface VerifiedDrillContext {
  request: MisDrillPreparationRequest;
  resolution: MasterResolvedSelection;
  outline: StatementOutlineNode[];
  batchStatuses: MisDrillBatchStatus[];
  actuals: ProvenanceBatch[];
  budget: ProvenanceBatch;
  range: { from: string; to: string };
  focusExists: boolean;
  leafKey: string | null;
  budgetState: "loaded" | "not-loaded";
  focusedActualPaise?: string;
}

export type MisDrillPreparationOutcome =
  | { outcome: "prepared"; context: VerifiedDrillContext }
  | { outcome: "gone"; message: string; batchStatuses: MisDrillBatchStatus[]; status: number }
  | { outcome: "refused"; message: string; batchStatuses: MisDrillBatchStatus[]; status: number };

export type MisDrillReadResponse = Omit<MisDrillResponse, "pageSize"> & {
  pageSize: number;
  rollup: StatementRollupEntry[];
  budgetState: "loaded" | "not-loaded";
};

export type MisDrillOutcome =
  | { outcome: "ok"; response: MisDrillReadResponse }
  | { outcome: "replaced"; response: MisDrillReadResponse }
  | { outcome: "gone"; message: string; batchStatuses: MisDrillBatchStatus[]; status: number }
  | { outcome: "audit-failed"; message: string; status: number }
  | { outcome: "refused"; message: string; batchStatuses: MisDrillBatchStatus[]; status: number };

export interface IMisDrillService {
  prepare(user: AuthUser, request: MisDrillPreparationRequest | MisDrillRequest): Promise<MisDrillPreparationOutcome>;
  read(user: AuthUser, sessionId: string, context: VerifiedDrillContext, rowLimit: number): Promise<MisDrillOutcome>;
  run(user: AuthUser, sessionId: string, request: MisDrillRequest): Promise<MisDrillOutcome>;
}

export class AuditedDrillRefusalException extends HttpException {
  constructor(
    status: number,
    message: string,
    readonly batchStatuses: MisDrillBatchStatus[] = [],
  ) {
    super({ message, batchStatuses }, status);
  }
}
