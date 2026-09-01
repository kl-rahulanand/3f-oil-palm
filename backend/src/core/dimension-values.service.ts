import { Inject, Injectable } from "@nestjs/common";
import { WAREHOUSE, loadConfig } from "../config";
import type { Warehouse } from "../warehouse/warehouse.interface";

type DimensionValuesCacheEntry = {
  values: string[];
  expiresAt: number;
};

@Injectable()
export class DimensionValuesService {
  private readonly cacheTtlMs = loadConfig().scopeValueCacheTtlMs;
  private readonly cache = new Map<string, DimensionValuesCacheEntry>();

  constructor(@Inject(WAREHOUSE) private readonly warehouse: Warehouse) {}

  async values(goldObject: string, column: string): Promise<string[]> {
    const cacheKey = `${goldObject}\u0000${column}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.values;

    try {
      const values = await this.warehouse.distinctValues(goldObject, column);
      this.cache.set(cacheKey, {
        values,
        expiresAt: now + this.cacheTtlMs,
      });
      return values;
    } catch {
      return [];
    }
  }
}
