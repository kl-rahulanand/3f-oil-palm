import { Inject, Injectable } from "@nestjs/common";
import type { WarehouseFreshnessResponse } from "@3f/contract";
import { WAREHOUSE } from "../config";
import type { IFreshnessService } from "./freshness.interface";
import type { Warehouse } from "./warehouse.interface";

@Injectable()
export class FreshnessService implements IFreshnessService {
  constructor(@Inject(WAREHOUSE) private readonly warehouse: Warehouse) {}

  freshness(): Promise<WarehouseFreshnessResponse> {
    return this.warehouse.loadFreshness?.() ?? Promise.resolve({ status: "unsupported", freshnessKind: "load" });
  }
}
