import { Injectable } from "@nestjs/common";
import type { WarehouseLoadFreshness } from "@3f/contract";
import { createPool, type Pool } from "mysql2/promise";
import type { QueryResult, Warehouse } from "./warehouse.interface";
import { type Config, loadConfig } from "../config";

type MysqlError = Error & {
  code?: string;
  sqlMessage?: string;
};

type MysqlField = {
  name: string;
  type: number;
};

type MysqlConnection = {
  query: (options: { sql: string; timeout?: number }) => Promise<[unknown, MysqlField[]]>;
  release: () => void;
};

const NUMERIC_FIELD_TYPES = new Set([
  0, // DECIMAL
  1, // TINY
  2, // SHORT
  3, // LONG
  4, // FLOAT
  5, // DOUBLE
  8, // LONGLONG
  9, // INT24
  13, // YEAR
  246, // NEWDECIMAL
]);

export function isNumericFieldType(type: number): boolean {
  return NUMERIC_FIELD_TYPES.has(type);
}

export function toStarRocksMysqlCell(value: unknown, numeric = false): string | number | null {
  if (value === undefined || value === null) return null;
  const cell = typeof value === "string" || typeof value === "number" ? value : String(value);
  return numeric ? Number(cell) : cell;
}

@Injectable()
export class StarRocksMysqlAdapter implements Warehouse {
  private readonly cfg: Config = loadConfig();
  private readonly configured = !!this.cfg.starrocks.host;
  private pool?: Pool;
  private readonly catalogSql =
    this.cfg.starrocks.catalog && this.cfg.starrocks.catalog !== "default_catalog"
      ? `SET CATALOG \`${this.cfg.starrocks.catalog.replace(/`/g, "``")}\``
      : null;

  async explain(sql: string): Promise<void> {
    if (!this.configured) return; // mock: assume plannable
    try {
      await this.query(`EXPLAIN ${sql}`);
    } catch (e) {
      const { kind, detail } = this.classifyError(e);
      throw this.error("explain", kind, detail);
    }
  }

  async execute(sql: string): Promise<QueryResult> {
    if (!this.configured) return this.mock(sql);
    try {
      const [rows, fields] = await this.query(sql);
      return this.toQueryResult(rows, fields);
    } catch (e) {
      const { kind, detail } = this.classifyError(e);
      throw this.error("execute", kind, detail);
    }
  }

  async freshness(goldObject: string, column?: string): Promise<string | null> {
    if (!column) return null;
    if (!this.configured) return "2026-07-07T00:00:00.000Z";
    try {
      const result = await this.execute(`SELECT MAX(${column}) FROM ${goldObject}`);
      const firstColumn = result.columns[0]?.name;
      if (!firstColumn) return null;
      return toIsoString(result.rows[0]?.[firstColumn]);
    } catch {
      return null;
    }
  }

  async loadFreshness(): Promise<WarehouseLoadFreshness> {
    return { status: "unsupported", freshnessKind: "load" };
  }

  async distinctValues(goldObject: string, column: string): Promise<string[]> {
    if (!this.configured) return ["NZ", "SZ", "EZ", "WZ"]; // mock regions
    const result = await this.execute(`SELECT DISTINCT ${column} FROM ${goldObject} LIMIT 1000`);
    const firstColumn = result.columns[0]?.name;
    if (!firstColumn) return [];
    return result.rows
      .map((row) => row[firstColumn])
      .filter((value): value is string | number => value !== null)
      .map((value) => String(value));
  }

  private async query(sql: string): Promise<[unknown, MysqlField[]]> {
    if (this.catalogSql) {
      const connection = (await this.getPool().getConnection()) as MysqlConnection;
      try {
        await connection.query({ sql: this.catalogSql, timeout: this.cfg.queryTimeoutMs });
        return await connection.query({ sql, timeout: this.cfg.queryTimeoutMs });
      } finally {
        connection.release();
      }
    }
    const [rows, fields] = await this.getPool().query({ sql, timeout: this.cfg.queryTimeoutMs });
    return [rows, fields as MysqlField[]];
  }

  private getPool(): Pool {
    if (this.pool) return this.pool;
    const pool = createPool({
      host: this.cfg.starrocks.host,
      port: this.cfg.starrocks.mysqlPort,
      user: this.cfg.starrocks.username,
      password: this.cfg.starrocks.password,
      database: this.cfg.starrocks.database,
      connectionLimit: 5,
      decimalNumbers: true,
      dateStrings: true,
    });
    this.pool = pool;
    return pool;
  }

  private toQueryResult(rows: unknown, fields: MysqlField[]): QueryResult {
    const columns = fields.map((field) => ({
      name: field.name,
      numeric: isNumericFieldType(field.type),
    }));
    const rowArray = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
    return {
      columns,
      rows: rowArray.map(
        (row) =>
          Object.fromEntries(
            columns.map((column) => [column.name, toStarRocksMysqlCell(row[column.name], column.numeric)]),
          ) as Record<string, string | number | null>,
      ),
    };
  }

  private classifyError(e: unknown): { kind: string; detail: string } {
    const err = e as MysqlError;
    const code = typeof err?.code === "string" ? err.code : "";
    const message = this.errorDetail(e);
    if (code === "PROTOCOL_SEQUENCE_TIMEOUT" || err?.name === "TimeoutError") {
      return { kind: "timeout", detail: message };
    }
    if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST"].includes(code)) {
      return { kind: "network", detail: message };
    }
    if (/timeout/i.test(message)) {
      return { kind: "timeout", detail: message };
    }
    return { kind: "query_rejected", detail: err?.sqlMessage ?? message };
  }

  private errorDetail(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private error(operation: "explain" | "execute", kind: string, detail: string): Error {
    return new Error(`StarRocks ${operation} failed [${kind}]: ${detail}`);
  }

  /** Deterministic empty result when no warehouse is configured. */
  private mock(_sql: string): QueryResult {
    return { columns: [], rows: [] };
  }
}

function toIsoString(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
