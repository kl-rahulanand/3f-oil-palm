import type { AuthUser, DomainSpec, MisSelectionRunRequest, MisStatementRunResponse, Selection } from "@3f/contract";
import type { MasterResolvedSelection } from "../mapping/selection-resolver.interface";

export interface MisStatementBlockDefinition {
  key: "selected" | "fy26-27-ytd";
  label: string;
  from: string;
  to: string;
}

export interface IMisStatementService {
  run(user: AuthUser, request: MisSelectionRunRequest): Promise<MisStatementRunResponse>;
}

export interface IMisStatementDrillSupport {
  authorize(user: AuthUser): { domain: DomainSpec; selection: Selection };
  blocks(resolution: MasterResolvedSelection): MisStatementBlockDefinition[];
}
