import type { AuthUser, MisSelectionRunRequest, MisStatementRunResponse } from "@3f/contract";

export interface IMisStatementService {
  run(user: AuthUser, request: MisSelectionRunRequest): Promise<MisStatementRunResponse>;
}
