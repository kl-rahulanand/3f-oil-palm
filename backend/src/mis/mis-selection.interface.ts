import type {
  AuthUser,
  MisSelectionOptionsResponse,
  MisSelectionRunRequest,
  MisSelectionRunResponse,
} from "@3f/contract";

export interface IMisSelectionService {
  options(user: AuthUser): Promise<MisSelectionOptionsResponse>;
  run(user: AuthUser, request: MisSelectionRunRequest): Promise<MisSelectionRunResponse>;
}
