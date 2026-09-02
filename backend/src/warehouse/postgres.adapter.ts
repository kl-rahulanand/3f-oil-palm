import { Injectable } from "@nestjs/common";
import { Pool, type FieldDef, type PoolConfig } from "pg";
import { type Config, loadConfig } from "../config";
import type { QueryResult, Warehouse } from "./warehouse.interface";

type PostgresError = Error & { code?: string };

const NUMERIC_FIELD_OIDS = new Set([
  20, // int8
  21, // int2
  23, // int4
  700, // float4
  701, // float8
  1700, // numeric
]);

export function pgOidIsNumeric(oid: number): boolean {
  return NUMERIC_FIELD_OIDS.has(oid);
}

@Injectable()
export class PostgresAdapter implements Warehouse {
  private readonly cfg: Config = loadConfig();
  private readonly configured = Boolean(
    this.cfg.warehouse.postgres.host && this.cfg.warehouse.postgres.database,
  );
  private pool?: Pool;

  async explain(sql: string): Promise<void> {
    if (!this.configured) return;
    try {
      await this.getPool().query(`EXPLAIN ${sql}`);
    } catch (error) {
      throw this.mapError("explain", error);
    }
  }

  async execute(sql: string): Promise<QueryResult> {
    if (!this.configured) return { columns: [], rows: [] };
    try {
      const result = await this.getPool().query(sql);
      const columns = result.fields.map((field) => ({
        name: field.name,
        numeric: pgOidIsNumeric(field.dataTypeID),
      }));
      return {
        columns,
        rows: result.rows.map((row) => this.toRow(row, result.fields)),
      };
    } catch (error) {
      throw this.mapError("execute", error);
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

  async distinctValues(goldObject: string, column: string): Promise<string[]> {
    if (!this.configured) return [];
    const result = await this.execute(`SELECT DISTINCT ${column} FROM ${goldObject} LIMIT 1000`);
    const firstColumn = result.columns[0]?.name;
    if (!firstColumn) return [];
    return result.rows
      .map((row) => row[firstColumn])
      .filter((value): value is string | number => value !== null)
      .map(String);
  }

  private getPool(): Pool {
    if (this.pool) return this.pool;
    const postgres = this.cfg.warehouse.postgres;
    const poolConfig: PoolConfig = {
      host: postgres.host,
      port: postgres.port,
      user: postgres.user,
      password: postgres.password,
      database: postgres.database,
      max: 5,
      connectionTimeoutMillis: this.cfg.queryTimeoutMs,
      statement_timeout: this.cfg.queryTimeoutMs,
      query_timeout: this.cfg.queryTimeoutMs,
      allowExitOnIdle: true,
    };
    this.pool = new Pool(poolConfig);
    return this.pool;
  }

  private toRow(row: Record<string, unknown>, fields: FieldDef[]): Record<string, string | number | null> {
    return Object.fromEntries(
      fields.map((field) => [field.name, toPostgresCell(row[field.name])]),
    ) as Record<string, string | number | null>;
  }

  private mapError(operation: "explain" | "execute", error: unknown): Error {
    const postgresError = error as PostgresError;
    const kind = postgresError.code === "57014" ? "timeout" : "query_rejected";
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`Postgres ${operation} failed [${kind}]: ${detail}`);
  }
}

function toPostgresCell(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function toIsoString(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
