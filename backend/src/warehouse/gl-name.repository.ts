import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AskRowLabel } from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import { misOutlineIdentitySNo } from "../ingest/mis-format-outline";
import { SqlValidator } from "../sql/sqlValidator";
import type { DrillPredicate } from "./drill-transactions.interface";
import { buildDrillPredicate } from "./drill-transactions.repository";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "./statement-outline.interface";
import { StatementOutlineRepository } from "./statement-outline.repository";
import type { Warehouse } from "./warehouse.interface";

const OBJECTS_TOUCHED = ["sap_transaction", "ingest_batch", "raw_spellings", "normalized_groups"];
const SQL_WHITESPACE_CLASS = "[[:space:]\u00a0]";
const NORMALIZED_ACCOUNT_NAME_SQL = `REGEXP_REPLACE(REGEXP_REPLACE(txn.acct_name, '^${SQL_WHITESPACE_CLASS}+|${SQL_WHITESPACE_CLASS}+$', '', 'g'), '${SQL_WHITESPACE_CLASS}+', ' ', 'g')`;

export interface GlNameRow {
  key: string;
  predicate: DrillPredicate;
}

export interface StatementNameRow {
  key: string;
  leafKey: string;
}

@Injectable()
export class GlNameRepository {
  constructor(
    private readonly validator: SqlValidator,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
    @Inject(StatementOutlineRepository) private readonly outlines: IPinnedStatementOutlineRepository,
  ) {}

  async findGlCodeLabels(rows: GlNameRow[], budgetBatchId?: string): Promise<AskRowLabel[]> {
    const resolved = new Map<string, AskRowLabel>();
    const budgetOnly = new Set<string>();
    const sapNames = await this.findSapNames(rows);
    for (const [index, row] of rows.entries()) {
      const result = sapNames[index]!;
      if (result.names) resolved.set(row.key, { key: row.key, ...result.names });
      else if (!result.hasScopedLines) budgetOnly.add(row.key);
    }

    if (budgetBatchId && budgetOnly.size) {
      const outline = await this.outlines.findByBudgetBatchId(budgetBatchId);
      for (const row of rows.filter(({ key }) => budgetOnly.has(key))) {
        const glCode = row.predicate.mode === "gl-and-plants" ? row.predicate.glCode : undefined;
        const labels = outlineLabels(outline, (node) => node.glCode === glCode, false);
        if (labels.length) resolved.set(row.key, toRowLabel(row.key, labels));
      }
    }

    return rows.flatMap(({ key }) => {
      const label = resolved.get(key);
      return label ? [label] : [];
    });
  }

  async findStatementLabels(rows: StatementNameRow[], budgetBatchId?: string): Promise<AskRowLabel[]> {
    if (!budgetBatchId || rows.length === 0) return [];
    const outline = await this.outlines.findByBudgetBatchId(budgetBatchId);
    return rows.flatMap(({ key, leafKey }) => {
      const labels = outlineLabels(outline, (node) => node.leafKey === leafKey, true);
      return labels.length ? [toRowLabel(key, labels)] : [];
    });
  }

  private async findSapNames(rows: GlNameRow[]): Promise<SapNameResult[]> {
    if (rows.length === 0) return [];
    const config = loadConfig();
    const batchSize = config.maxRows;
    const resolved: SapNameResult[] = [];
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const setWise = hasSharedGlScope(batch);
      const sql = setWise
        ? setWiseNameSelect(batch)
        : `${batch.map(({ predicate }, rowOrdinal) => nameSelect(rowOrdinal, predicate)).join("\nUNION ALL\n")}
LIMIT ${batch.length}`;
      const validation = this.validator.validate(sql, OBJECTS_TOUCHED, config.maxRows);
      if (!validation.ok) throw new ForbiddenException(validation.reason ?? "GL name query blocked");
      await this.warehouse.explain(sql);
      const result = await withTimeout(this.warehouse.execute(sql), config.queryTimeoutMs);
      if (setWise) {
        const byKey = new Map<string, Record<string, string | number | null>>();
        for (const resultRow of result.rows) {
          const key = String(resultRow.row_key ?? "");
          if (!batch.some(({ predicate }) => predicate.mode === "gl-and-plants" && predicate.glCode === key)) {
            throw new Error("GL name query returned an invalid row key");
          }
          if (byKey.has(key)) throw new Error("GL name query returned a duplicate row key");
          byKey.set(key, resultRow);
        }
        for (const { predicate } of batch) {
          if (predicate.mode !== "gl-and-plants") throw new Error("GL name query mixed incompatible scopes");
          resolved.push(rankedNames(byKey.get(predicate.glCode) ?? { scoped_line_count: "0", name_groups: "[]" }));
        }
        continue;
      }
      const byOrdinal = new Map<number, Record<string, string | number | null>>();
      for (const row of result.rows) {
        const rowOrdinal = lineCount(row.row_ordinal);
        if (rowOrdinal >= batch.length) throw new Error("GL name query returned an invalid row ordinal");
        if (byOrdinal.has(rowOrdinal)) throw new Error("GL name query returned a duplicate answer row");
        byOrdinal.set(rowOrdinal, row);
      }
      for (let rowOrdinal = 0; rowOrdinal < batch.length; rowOrdinal += 1) {
        const nameRows = byOrdinal.get(rowOrdinal);
        if (!nameRows) throw new Error("GL name query omitted an answer row");
        resolved.push(rankedNames(nameRows));
      }
    }
    return resolved;
  }
}

function hasSharedGlScope(batch: GlNameRow[]): boolean {
  const [first] = batch;
  if (!first || first.predicate.mode !== "gl-and-plants") return false;
  const firstScope = glScope(first.predicate);
  return batch.every(({ predicate }) => predicate.mode === "gl-and-plants" && glScope(predicate) === firstScope);
}

function glScope(predicate: Extract<DrillPredicate, { mode: "gl-and-plants" }>): string {
  return buildDrillPredicate({ ...predicate, glCode: "__shared_scope__" });
}

function setWiseNameSelect(batch: GlNameRow[]): string {
  const hasName = `txn.acct_name IS NOT NULL AND ${NORMALIZED_ACCOUNT_NAME_SQL} <> ''`;
  const where = batch.map(({ predicate }) => `(${buildDrillPredicate(predicate)})`).join(" OR ");
  return `WITH raw_spellings AS (
  SELECT txn.gl_code,
    CASE WHEN ${hasName} THEN LOWER(${NORMALIZED_ACCOUNT_NAME_SQL}) ELSE NULL END AS normalized_name,
    CASE WHEN ${hasName} THEN ${NORMALIZED_ACCOUNT_NAME_SQL} ELSE NULL END AS spelling,
    COUNT(*) AS spelling_count,
    SUM(COUNT(*)) OVER (PARTITION BY txn.gl_code) AS scoped_line_count
  FROM sap_transaction AS txn
  INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
  WHERE ${where}
  GROUP BY txn.gl_code,
    CASE WHEN ${hasName} THEN LOWER(${NORMALIZED_ACCOUNT_NAME_SQL}) ELSE NULL END,
    CASE WHEN ${hasName} THEN ${NORMALIZED_ACCOUNT_NAME_SQL} ELSE NULL END
), normalized_groups AS (
  SELECT raw_spellings.gl_code,
    raw_spellings.normalized_name,
    SUM(raw_spellings.spelling_count) AS line_count,
    (ARRAY_AGG(raw_spellings.spelling ORDER BY raw_spellings.spelling_count DESC, raw_spellings.spelling))[1] AS acct_name,
    MAX(raw_spellings.scoped_line_count) AS scoped_line_count
  FROM raw_spellings
  GROUP BY raw_spellings.gl_code, raw_spellings.normalized_name
)
SELECT normalized_groups.gl_code AS row_key,
  MAX(normalized_groups.scoped_line_count)::text AS scoped_line_count,
  COALESCE(
    JSON_AGG(CASE WHEN normalized_groups.normalized_name IS NOT NULL
      THEN JSON_BUILD_ARRAY(normalized_groups.acct_name, normalized_groups.line_count) ELSE NULL END),
    '[]'::json
  )::text AS name_groups
FROM normalized_groups
GROUP BY normalized_groups.gl_code
ORDER BY normalized_groups.gl_code
LIMIT ${batch.length}`;
}

function nameSelect(rowOrdinal: number, predicate: DrillPredicate): string {
  const where = buildDrillPredicate(predicate);
  return `(SELECT ${rowOrdinal} AS row_ordinal,
  scoped_total.scoped_line_count::text AS scoped_line_count,
  COALESCE(
    JSON_AGG(CASE WHEN name_groups.normalized_name IS NOT NULL
      THEN JSON_BUILD_ARRAY(name_groups.acct_name, name_groups.line_count) ELSE NULL END),
    '[]'::json
  )::text AS name_groups
FROM (
  SELECT COUNT(*) AS scoped_line_count
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE ${where}
) AS scoped_total
LEFT JOIN (
  SELECT spellings.normalized_name,
    SUM(spellings.spelling_count) AS line_count,
    (ARRAY_AGG(spellings.spelling ORDER BY spellings.spelling_count DESC, spellings.spelling))[1] AS acct_name
  FROM (
    SELECT LOWER(${NORMALIZED_ACCOUNT_NAME_SQL}) AS normalized_name,
      ${NORMALIZED_ACCOUNT_NAME_SQL} AS spelling,
      COUNT(*) AS spelling_count
    FROM sap_transaction AS txn
    INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
    WHERE ${where}
      AND txn.acct_name IS NOT NULL
      AND ${NORMALIZED_ACCOUNT_NAME_SQL} <> ''
    GROUP BY LOWER(${NORMALIZED_ACCOUNT_NAME_SQL}), ${NORMALIZED_ACCOUNT_NAME_SQL}
  ) AS spellings
  GROUP BY spellings.normalized_name
) AS name_groups ON TRUE
GROUP BY scoped_total.scoped_line_count
LIMIT 1)`;
}

interface SapNameResult {
  names?: Omit<AskRowLabel, "key">;
  hasScopedLines: boolean;
}

function rankedNames(row: Record<string, string | number | null>): SapNameResult {
  const hasScopedLines = lineCount(row.scoped_line_count) > 0;
  const ranked = parseNameGroups(row.name_groups).sort(
    (left, right) => right.count - left.count || alphabetical(left.label, right.label),
  );
  if (!ranked.length) return { hasScopedLines };
  return {
    hasScopedLines,
    names: {
      label: ranked[0]!.label,
      otherLabels: ranked.slice(1).map(({ label }) => label),
    },
  };
}

function parseNameGroups(value: string | number | null | undefined): Array<{ count: number; label: string }> {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "string") throw new Error("GL name query returned invalid name groups");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("GL name query returned invalid name groups");
  }
  if (!Array.isArray(parsed)) throw new Error("GL name query returned invalid name groups");
  return parsed.flatMap((group) => {
    if (group === null) return [];
    if (!Array.isArray(group) || group.length !== 2 || typeof group[0] !== "string") {
      throw new Error("GL name query returned invalid name groups");
    }
    const label = cleanWhitespace(group[0]);
    if (!label) throw new Error("GL name query returned invalid name groups");
    return [
      { label, count: lineCount(typeof group[1] === "number" || typeof group[1] === "string" ? group[1] : null) },
    ];
  });
}

function outlineLabels(
  outline: StatementOutlineNode[],
  matches: (node: StatementOutlineNode) => boolean,
  includeNumber: boolean,
): string[] {
  const labels = outline
    .filter(matches)
    .sort((left, right) => left.sortOrder - right.sortOrder || alphabetical(left.nodeKey, right.nodeKey))
    .map((node) => {
      const sNo = includeNumber ? misOutlineIdentitySNo(node, outline) : undefined;
      return cleanWhitespace(sNo ? `${sNo} ${node.label}` : node.label);
    });
  return [...new Set(labels.filter(Boolean))];
}

function toRowLabel(key: string, labels: string[]): AskRowLabel {
  return {
    key,
    label: labels[0]!,
    otherLabels: labels.slice(1),
  };
}

function cleanWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function lineCount(value: string | number | null | undefined): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("GL name query returned an invalid line count");
  return count;
}

function alphabetical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("GL name query timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
