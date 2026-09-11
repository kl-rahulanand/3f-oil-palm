import { HttpException } from "@nestjs/common";
import type { AuthUser, MisDrillBatchStatus, MisDrillRequest, MisDrillResponse } from "@3f/contract";

export interface IMisDrillService {
  run(user: AuthUser, sessionId: string, request: MisDrillRequest): Promise<MisDrillResponse>;
}

export class AuditedDrillRefusalException extends HttpException {
  constructor(
    status: number,
    message: string,
    readonly batchStatuses: MisDrillBatchStatus[] = [],
  ) {
    super(message, status);
  }
}
