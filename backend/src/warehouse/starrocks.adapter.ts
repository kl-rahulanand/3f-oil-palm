import { Injectable } from "@nestjs/common";
import type { QueryResult, Warehouse } from "./warehouse.interface";
import { type Config, loadConfig } from "../config";

type StarRocksColumn = { name: string; type: string };
type StarRocksLine = {
  connectionId?: number;
  meta?: StarRocksColumn[];
  data?: unknown[];
  statistics?: unknown;
  explain?: unknown;
  status?: string;
  msg?: string;
};

@Injectable()
export class StarRocksAdapter implements Warehouse {
  private readonly cfg: Config = loadConfig();
  private readonly configured = !!this.cfg.starrocks.httpUrl;
  private readonly numericTypePrefixes = [
    "tinyint",
    "smallint",
    "int",
    "bigint",
    "largeint",
    "decimal",
    "double",
    "float",
    "numeric",
  ];

  async explain(sql: string): Promise<void> {
    if (!this.configured) return; // mock: assume plannable
    const lines = await this.post("explain", `EXPLAIN ${sql}`);
    const explainText = lines
      .map((line) => this.flattenExplain(line.explain))
      .filter((text) => text.length > 0)
      .join("\n");
    if (!explainText) {
      throw new Error("StarRocks explain failed [protocol]: no explain text returned");
    }
  }

  async execute(sql: string): Promise<QueryResult> {
    if (!this.configured) return this.mock(sql);
    const lines = await this.post("execute", sql);
    return this.toQueryResult(lines);
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
    if (!this.configured) return ["NZ", "SZ", "EZ", "WZ"]; // mock regions
    const result = await this.execute(`SELECT DISTINCT ${column} FROM ${goldObject} LIMIT 1000`);
    const firstColumn = result.columns[0]?.name;
    if (!firstColumn) return [];
    return result.rows
      .map((row) => row[firstColumn])
      .filter((value): value is string | number => value !== null)
      .map((value) => String(value));
  }

  private async post(operation: "explain" | "execute", sql: string): Promise<StarRocksLine[]> {
    const baseUrl = this.cfg.starrocks.httpUrl.replace(/\/+$/, "");
    const catalog = encodeURIComponent(this.cfg.starrocks.catalog);
    const database = encodeURIComponent(this.cfg.starrocks.database);
    const url = `${baseUrl}/api/v1/catalogs/${catalog}/databases/${database}/sql`;
    const timeoutSeconds = Math.max(1, Math.ceil(this.cfg.queryTimeoutMs / 1000));

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.cfg.starrocks.username}:${this.cfg.starrocks.password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sql,
          sessionVariables: { query_timeout: timeoutSeconds },
        }),
        signal: AbortSignal.timeout(this.cfg.queryTimeoutMs),
      });
    } catch (e) {
      throw this.error(operation, this.isTimeoutError(e) ? "timeout" : "network", this.errorDetail(e));
    }

    let body: string;
    try {
      body = await response.text();
    } catch (e) {
      throw this.error(operation, this.isTimeoutError(e) ? "timeout" : "network", this.errorDetail(e));
    }

    if (!response.ok) {
      throw this.error(operation, "http_error", `${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
    }

    const lines = this.parseNdjson(operation, body);
    const rejected = lines.find((line) => line.status === "FAILED");
    if (rejected) {
      throw this.error(operation, "query_rejected", rejected.msg ?? "query rejected");
    }
    return lines;
  }

  private parseNdjson(operation: "explain" | "execute", body: string): StarRocksLine[] {
    try {
      return body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as StarRocksLine);
    } catch (e) {
      throw this.error(operation, "protocol", `invalid NDJSON: ${this.errorDetail(e)}`);
    }
  }

  private toQueryResult(lines: StarRocksLine[]): QueryResult {
    const meta = lines.find((line) => line.meta)?.meta;
    if (!meta) {
      throw new Error("StarRocks execute failed [protocol]: missing column metadata");
    }
    const columns = meta.map((column) => ({
      name: column.name,
      numeric: this.isNumericType(column.type),
    }));
    const rows = lines
      .filter((line): line is StarRocksLine & { data: unknown[] } => Array.isArray(line.data))
      .map((line) =>
        Object.fromEntries(columns.map((column, index) => [column.name, this.toCell(line.data[index])])) as Record<
          string,
          string | number | null
        >,
      );
    return { columns, rows };
  }

  private flattenExplain(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map((part) => this.flattenExplain(part)).filter(Boolean).join("\n");
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  private isNumericType(type: string): boolean {
    const lowered = type.toLowerCase();
    return this.numericTypePrefixes.some((prefix) => lowered.startsWith(prefix));
  }

  private toCell(value: unknown): string | number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    return String(value);
  }

  private isTimeoutError(e: unknown): boolean {
    return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
  }

  private errorDetail(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private error(operation: "explain" | "execute", kind: string, detail: string): Error {
    return new Error(`StarRocks ${operation} failed [${kind}]: ${detail}`);
  }

  /** Deterministic offline mock for the sample operations question. */
  private mock(_sql: string): QueryResult {
    return {
      columns: [
        { name: "serviceable_pincode", numeric: false },
        { name: "lead_count", numeric: true },
      ],
      rows: [
        { serviceable_pincode: "Serviceable", lead_count: 8421 },
        { serviceable_pincode: "Non-serviceable", lead_count: 2765 },
      ],
    };
  }
}

function toIsoString(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
