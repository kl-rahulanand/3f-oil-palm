import { Inject, Injectable } from "@nestjs/common";
import { WAREHOUSE } from "../config";
import type { Warehouse } from "./warehouse.interface";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "./statement-outline.interface";

@Injectable()
export class StatementOutlineRepository implements IPinnedStatementOutlineRepository {
  constructor(@Inject(WAREHOUSE) private readonly warehouse: Warehouse) {}

  async findByBudgetPeriod(period: string): Promise<StatementOutlineNode[]> {
    return this.find(`batch.period = '${period.replace(/'/g, "''")}' AND batch.is_active`);
  }

  async findByBudgetBatchId(batchId: string): Promise<StatementOutlineNode[]> {
    return this.find(`batch.id = '${batchId.replace(/'/g, "''")}'`);
  }

  private async find(predicate: string): Promise<StatementOutlineNode[]> {
    const result = await this.warehouse.execute(`SELECT outline.node_key, outline.parent_key, outline.depth,
  outline.s_no, outline.label, outline.sort_order, outline.gl_code, outline.leaf_key
FROM mis_budget_outline AS outline
INNER JOIN ingest_batch AS batch ON batch.id = outline.batch_id
WHERE batch.source_kind = 'budget' AND ${predicate}
ORDER BY outline.sort_order, outline.node_key
LIMIT 25000`);
    return result.rows.map((row) => ({
      nodeKey: String(row.node_key),
      parentKey: row.parent_key === null ? null : String(row.parent_key),
      depth: Number(row.depth),
      sNo: row.s_no === null ? null : String(row.s_no),
      label: String(row.label),
      sortOrder: Number(row.sort_order),
      glCode: row.gl_code === null ? null : String(row.gl_code),
      leafKey: row.leaf_key === null ? null : String(row.leaf_key),
    }));
  }
}
