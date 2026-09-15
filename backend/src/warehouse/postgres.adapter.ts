import { Injectable } from "@nestjs/common";
import type { WarehouseLoadFreshness } from "@3f/contract";
import { Pool, type FieldDef, type PoolConfig } from "pg";
import { StructuredLogger } from "../common/structured.logger";
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

/** Postgres `date` - a calendar day with no time and no zone. */
const DATE_FIELD_OID = 1082;

export function pgOidIsCalendarDate(oid: number): boolean {
  return oid === DATE_FIELD_OID;
}

@Injectable()
export class PostgresAdapter implements Warehouse {
  private readonly cfg: Config = loadConfig();
  private readonly logger = new StructuredLogger(this.cfg);
  private readonly configured = Boolean(this.cfg.warehouse.postgres.host && this.cfg.warehouse.postgres.database);
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

  async loadFreshness(): Promise<WarehouseLoadFreshness> {
    if (!this.configured) return { status: "unconfigured", freshnessKind: "load" };
    try {
      const result = await this.execute(
        "SELECT source_kind, MIN(uploaded_at_utc) AS oldest_uploaded_at_utc FROM ingest_batch WHERE is_active GROUP BY source_kind ORDER BY source_kind",
      );
      if (result.rows.length === 0) return { status: "no-active-batches", freshnessKind: "load" };
      const sources = result.rows.map((row) => ({
        source: row.source_kind as "actuals" | "budget",
        oldestUploadedAtUtc: String(row.oldest_uploaded_at_utc),
      }));
      return {
        status: "available",
        freshnessKind: "load",
        oldestUploadedAtUtc: sources.reduce(
          (oldest, source) => (source.oldestUploadedAtUtc < oldest ? source.oldestUploadedAtUtc : oldest),
          sources[0].oldestUploadedAtUtc,
        ),
        sources,
      };
    } catch {
      this.logger.log("error", "Warehouse load freshness lookup failed", { module: "PostgresAdapter" });
      return { status: "lookup-failed", freshnessKind: "load" };
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
      fields.map((field) => [field.name, toPostgresCell(row[field.name], field.dataTypeID)]),
    ) as Record<string, string | number | null>;
  }

  private mapError(operation: "explain" | "execute", error: unknown): Error {
    const postgresError = error as PostgresError;
    const kind = postgresError.code === "57014" ? "timeout" : "query_rejected";
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`Postgres ${operation} failed [${kind}]: ${detail}`);
  }
}

export function toPostgresCell(value: unknown, oid?: number): string | number | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    // A Postgres `date` carries no time and no zone, but node-postgres materialises it as a
    // JS Date at LOCAL midnight. Calling toISOString() on that re-reads it in UTC, so east of
    // Greenwich every calendar day came back as the previous day: 2026-07-01 surfaced as
    // "2026-06-30T18:30:00.000Z". That wrong string reached three places - the month column
    // users read, the distinctValues list the selector is given as allowed filter values, and
    // the equality filter the selector then emitted, which could never match the date column.
    // Keep the calendar day the database actually stored; only true instants get an ISO one.
    if (oid !== undefined && pgOidIsCalendarDate(oid)) return toLocalCalendarDate(value);
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function toLocalCalendarDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoString(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
