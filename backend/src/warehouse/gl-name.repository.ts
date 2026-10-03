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

const OBJECTS_TOUCHED = ["sap_transaction", "ingest_batch", "raw_spellings", "normalized_groups", "ranked_names"];
const NAME_GROUP_LIMIT = 20;
const SQL_WHITESPACE_CLASS = "[[:space:]\u00a0]";
const NORMALIZED_ACCOUNT_NAME_SQL = `REGEXP_REPLACE(REGEXP_REPLACE(txn.acct_name, '^${SQL_WHITESPACE_CLASS}+|${SQL_WHITESPACE_CLASS}+$', '', 'g'), '${SQL_WHITESPACE_CLASS}+', ' ', 'g')`;

export interface GlNameRow {
  key: string;
  predicate: DrillPredicate;
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
      for (const key of budgetOnly) {
        const labels = outlineLabels(outline, ({ glCode }) => glCode === key, false);
        if (labels.length) resolved.set(key, toRowLabel(key, labels));
      }
    }

    return rows.flatMap(({ key }) => {
      const label = resolved.get(key);
      return label ? [label] : [];
    });
  }

  async findStatementLabels(keys: string[], budgetBatchId?: string): Promise<AskRowLabel[]> {
    if (!budgetBatchId || keys.length === 0) return [];
    const outline = await this.outlines.findByBudgetBatchId(budgetBatchId);
    return keys.flatMap((key) => {
      const labels = outlineLabels(outline, ({ leafKey }) => leafKey === key, true);
      return labels.length ? [toRowLabel(key, labels)] : [];
    });
  }

  private async findSapNames(rows: GlNameRow[]): Promise<SapNameResult[]> {
    if (rows.length === 0) return [];
    const config = loadConfig();
    const groupLimit = Math.max(1, Math.min(NAME_GROUP_LIMIT, config.maxRows));
    const batchSize = Math.max(1, Math.floor(config.maxRows / groupLimit));
    const resolved: SapNameResult[] = [];
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const setWise = hasSharedGlScope(batch);
      const sql = setWise
        ? setWiseNameSelect(batch, groupLimit)
        : `${batch
            .map(({ predicate }, rowOrdinal) => nameSelect(rowOrdinal, predicate, groupLimit))
            .join("\nUNION ALL\n")}
LIMIT ${batch.length * groupLimit}`;
      const validation = this.validator.validate(sql, OBJECTS_TOUCHED, config.maxRows);
      if (!validation.ok) throw new ForbiddenException(validation.reason ?? "GL name query blocked");
      await this.warehouse.explain(sql);
      const result = await withTimeout(this.warehouse.execute(sql), config.queryTimeoutMs);
      if (setWise) {
        const byKey = new Map<string, Array<Record<string, string | number | null>>>();
        for (const resultRow of result.rows) {
          const key = String(resultRow.row_key ?? "");
          if (!batch.some(({ predicate }) => predicate.mode === "gl-and-plants" && predicate.glCode === key)) {
            throw new Error("GL name query returned an invalid row key");
          }
          const grouped = byKey.get(key) ?? [];
          grouped.push(resultRow);
          byKey.set(key, grouped);
        }
        for (const { predicate } of batch) {
          if (predicate.mode !== "gl-and-plants") throw new Error("GL name query mixed incompatible scopes");
          resolved.push(
            rankedNames(
              byKey.get(predicate.glCode) ?? [
                { acct_name: null, line_count: null, scoped_line_count: "0", name_group_count: "0" },
              ],
            ),
          );
        }
        continue;
      }
      const byOrdinal = new Map<number, Array<Record<string, string | number | null>>>();
      for (const row of result.rows) {
        const rowOrdinal = lineCount(row.row_ordinal);
        if (rowOrdinal >= batch.length) throw new Error("GL name query returned an invalid row ordinal");
        const grouped = byOrdinal.get(rowOrdinal) ?? [];
        grouped.push(row);
        byOrdinal.set(rowOrdinal, grouped);
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

function setWiseNameSelect(batch: GlNameRow[], groupLimit: number): string {
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
), ranked_names AS (
  SELECT normalized_groups.gl_code,
    normalized_groups.normalized_name,
    normalized_groups.acct_name,
    normalized_groups.line_count,
    normalized_groups.scoped_line_count,
    SUM(CASE WHEN normalized_groups.normalized_name IS NULL THEN 0 ELSE 1 END)
      OVER (PARTITION BY normalized_groups.gl_code) AS name_group_count,
    CASE WHEN normalized_groups.normalized_name IS NOT NULL THEN
      ROW_NUMBER() OVER (PARTITION BY normalized_groups.gl_code
        ORDER BY CASE WHEN normalized_groups.normalized_name IS NULL THEN 1 ELSE 0 END,
          normalized_groups.line_count DESC, normalized_groups.acct_name)
    ELSE NULL END AS name_rank
  FROM normalized_groups
)
SELECT ranked_names.gl_code AS row_key,
  ranked_names.acct_name,
  ranked_names.line_count::text AS line_count,
  ranked_names.scoped_line_count::text AS scoped_line_count,
  ranked_names.name_group_count::text AS name_group_count
FROM ranked_names
WHERE ranked_names.name_rank <= ${groupLimit} OR ranked_names.name_group_count = 0
ORDER BY ranked_names.gl_code, ranked_names.name_rank
LIMIT ${batch.length * groupLimit}`;
}

function nameSelect(rowOrdinal: number, predicate: DrillPredicate, groupLimit: number): string {
  const where = buildDrillPredicate(predicate);
  return `(SELECT ${rowOrdinal} AS row_ordinal, name_groups.acct_name,
  name_groups.line_count::text AS line_count,
  scoped_total.scoped_line_count::text AS scoped_line_count,
  COALESCE(name_groups.name_group_count, 0)::text AS name_group_count
FROM (
  SELECT COUNT(*) AS scoped_line_count
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE ${where}
) AS scoped_total
LEFT JOIN (
  SELECT spellings.normalized_name,
    SUM(spellings.spelling_count) AS line_count,
    (ARRAY_AGG(spellings.spelling ORDER BY spellings.spelling_count DESC, spellings.spelling))[1] AS acct_name,
    COUNT(*) OVER () AS name_group_count
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
  ORDER BY SUM(spellings.spelling_count) DESC,
    (ARRAY_AGG(spellings.spelling ORDER BY spellings.spelling_count DESC, spellings.spelling))[1]
  LIMIT ${groupLimit}
) AS name_groups ON TRUE
ORDER BY name_groups.line_count DESC, name_groups.acct_name
LIMIT ${groupLimit})`;
}

interface SapNameResult {
  names?: Omit<AskRowLabel, "key">;
  hasScopedLines: boolean;
}

function rankedNames(rows: Array<Record<string, string | number | null>>): SapNameResult {
  const scopedCount = rows[0]?.scoped_line_count;
  const hasScopedLines = lineCount(scopedCount) > 0;
  const nameGroupCount = lineCount(rows[0]?.name_group_count);
  const groups: Array<{ count: number; label: string }> = [];
  for (const row of rows) {
    if (row.acct_name === null || row.acct_name === undefined) continue;
    const label = cleanWhitespace(String(row.acct_name));
    if (label) groups.push({ count: lineCount(row.line_count), label });
  }

  const ranked = groups.sort((left, right) => right.count - left.count || alphabetical(left.label, right.label));
  if (!ranked.length) return { hasScopedLines };
  if (nameGroupCount < ranked.length) throw new Error("GL name query returned an invalid name group count");
  const otherLabels = ranked.slice(1).map(({ label }) => label);
  const omitted = nameGroupCount - ranked.length;
  return {
    hasScopedLines,
    names: {
      label: ranked[0]!.label,
      otherLabels,
      ...(omitted > 0 ? { hiddenOtherLabelCount: omitted } : {}),
    },
  };
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
  return { key, label: labels[0]!, otherLabels: labels.slice(1) };
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
