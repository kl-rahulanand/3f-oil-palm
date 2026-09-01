import type { ResultTable } from "@pulse/contract";

export function applyKSuppression(
  result: ResultTable,
  opts: { countKey: string; measureKeys: string[]; k: number },
): ResultTable {
  const suppressedCells: Array<{ row: number; key: string }> = [];
  const columns = result.columns.filter((column) => column.key !== opts.countKey);
  const rows = result.rows.map((row, rowIndex) => {
    const rawCount = row[opts.countKey];
    const groupCount = typeof rawCount === "number" ? rawCount : Number(rawCount);
    // Fail CLOSED: suppress if the group count is below k OR missing/non-numeric.
    // A PII k-anonymity guard must never show a small-group value because the count
    // arrived as a string / was absent (some drivers return counts as strings).
    const shouldSuppress = !Number.isFinite(groupCount) || groupCount < opts.k;
    const nextRow = { ...row };
    delete nextRow[opts.countKey];

    if (shouldSuppress) {
      for (const key of opts.measureKeys) {
        nextRow[key] = null;
        suppressedCells.push({ row: rowIndex, key });
      }
    }

    return nextRow;
  });

  return suppressedCells.length > 0
    ? { columns, rows, suppressedCells }
    : { columns, rows };
}
