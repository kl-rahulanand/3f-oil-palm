import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AskRowLabel } from "@3f/contract";
import { WAREHOUSE, loadConfig } from "../config";
import { SqlValidator } from "../sql/sqlValidator";
import type { DrillPredicate } from "./drill-transactions.interface";
import { buildDrillPredicate } from "./drill-transactions.repository";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "./statement-outline.interface";
import { StatementOutlineRepository } from "./statement-outline.repository";
import type { Warehouse } from "./warehouse.interface";

const OBJECTS_TOUCHED = ["sap_transaction", "ingest_batch"];
const NAME_GROUP_LIMIT = 20;

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
      const sql = `${batch
        .map(({ predicate }, rowOrdinal) => nameSelect(rowOrdinal, predicate, groupLimit))
        .join("\nUNION ALL\n")}
LIMIT ${batch.length * groupLimit}`;
      const validation = this.validator.validate(sql, OBJECTS_TOUCHED, config.maxRows);
      if (!validation.ok) throw new ForbiddenException(validation.reason ?? "GL name query blocked");
      await this.warehouse.explain(sql);
      const result = await withTimeout(this.warehouse.execute(sql), config.queryTimeoutMs);
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

function nameSelect(rowOrdinal: number, predicate: DrillPredicate, groupLimit: number): string {
  const normalizedSpelling = "REGEXP_REPLACE(TRIM(txn.acct_name), '[[:space:]]+', ' ', 'g')";
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
    SELECT LOWER(${normalizedSpelling}) AS normalized_name,
      ${normalizedSpelling} AS spelling,
      COUNT(*) AS spelling_count
    FROM sap_transaction AS txn
    INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
    WHERE ${where}
      AND txn.acct_name IS NOT NULL
      AND TRIM(txn.acct_name) <> ''
    GROUP BY LOWER(${normalizedSpelling}), ${normalizedSpelling}
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
  if (omitted > 0) otherLabels.push(`and ${omitted} more`);
  return {
    hasScopedLines,
    names: { label: ranked[0]!.label, otherLabels },
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
    .map((node) => cleanWhitespace(includeNumber && node.sNo ? `${node.sNo} ${node.label}` : node.label));
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
