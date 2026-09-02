import { Injectable } from "@nestjs/common";
import { Parser } from "node-sql-parser";
import { SQL_VALIDATOR_MESSAGES } from "./sql.constants";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Deterministic safety gate (eng review C1) — an INDEPENDENT post-check on the SQL the
 * builder emits. Reads the same allowlist/limit source; does not re-derive semantic
 * knowledge. Even though our code generates the SQL, this backstops a builder bug before
 * it reaches the warehouse.
 */
@Injectable()
export class SqlValidator {
  private readonly parser = new Parser();

  validate(
    sql: string,
    allowedObjects: string[],
    maxRows: number,
    blockedColumns: string[] = [],
  ): ValidationResult {
    let ast: unknown;
    try {
      ast = this.parser.astify(sql, { database: "postgresql" });
    } catch (e) {
      return { ok: false, reason: `unparseable SQL: ${(e as Error).message}` };
    }
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) return { ok: false, reason: "multi-statement not allowed" };

    const stmt = statements[0] as { type?: string; columns?: unknown; limit?: unknown };
    if (stmt.type !== "select") return { ok: false, reason: "only SELECT is allowed" };

    // No SELECT *
    const cols = stmt.columns;
    if (cols === "*" || (Array.isArray(cols) && cols.some((c: any) => c?.expr?.column === "*")))
      return { ok: false, reason: "SELECT * is not allowed" };

    // Object allowlist — every referenced table must be approved.
    const tables = this.parser.tableList(sql, { database: "postgresql" }); // ["select::db::table", ...]
    const referenced = tables.map((t) => t.split("::").pop() ?? t);
    const approvedLeaf = allowedObjects.map((o) => o.split(".").pop());
    for (const r of referenced) {
      if (!approvedLeaf.includes(r)) return { ok: false, reason: `unapproved object: ${r}` };
    }

    const blocked = new Set(blockedColumns.map((c) => c.toLowerCase()));
    if (blocked.size > 0) {
      const columns = this.parser.columnList(sql, { database: "postgresql" });
      for (const entry of columns) {
        const column = entry.split("::").pop() ?? entry;
        if (blocked.has(column.toLowerCase())) {
          return { ok: false, reason: SQL_VALIDATOR_MESSAGES.blockedColumn(column) };
        }
      }
    }

    // Mandatory bounded LIMIT.
    const limit = stmt.limit as { value?: Array<{ value: number }> } | null | undefined;
    const limitVal = limit?.value?.[limit.value.length - 1]?.value;
    if (typeof limitVal !== "number") return { ok: false, reason: "missing LIMIT" };
    if (limitVal > maxRows) return { ok: false, reason: `LIMIT ${limitVal} exceeds max ${maxRows}` };

    return { ok: true };
  }
}
