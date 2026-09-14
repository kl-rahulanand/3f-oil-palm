import type { WarehouseFreshnessResponse } from "@3f/contract";

export interface IFreshnessService {
  freshness(): Promise<WarehouseFreshnessResponse>;
}
