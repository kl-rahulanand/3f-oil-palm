import type { MisStatementResolvedResponse } from "@3f/contract";

export interface IMisStatementExportService {
  write(statement: MisStatementResolvedResponse): Promise<Buffer>;
}
