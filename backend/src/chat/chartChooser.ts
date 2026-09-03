import type { ResultTable } from "@3f/contract";

export type ChartType = "kpi" | "line" | "bar" | "pie" | "table";

export interface ChartChoice {
  chartType: ChartType;
  availableChartTypes: ChartType[];
}

export function chooseChart(
  result: ResultTable | undefined | null,
  opts: { timeKeys: string[]; hint?: string },
): ChartChoice {
  if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows)) {
    return tableOnly();
  }

  const dims = result.columns.filter((column) => !column.numeric);
  const measures = result.columns.filter((column) => column.numeric);
  const rows = result.rows.length;
  const timeKeys = new Set(opts.timeKeys);
  const hasTimeDim = dims.some((dim) => timeKeys.has(dim.key));
  const hint = opts.hint?.toLowerCase() ?? "";

  const availableChartTypes: ChartType[] = [];
  if (dims.length === 0 && measures.length >= 1) availableChartTypes.push("kpi");
  if (hasTimeDim && measures.length >= 1) availableChartTypes.push("line");
  if (dims.length >= 1 && measures.length >= 1 && rows <= 50) availableChartTypes.push("bar");
  if (!hasTimeDim && dims.length === 1 && measures.length === 1 && rows <= 6) {
    availableChartTypes.push("pie");
  }
  availableChartTypes.push("table");

  let chartType: ChartType = "table";
  if (dims.length === 0 && measures.length >= 1) {
    chartType = "kpi";
  } else if (hasTimeDim) {
    chartType = "line";
  } else if (dims.length >= 1 && measures.length >= 1 && rows <= 50) {
    chartType = "bar";
  }

  if ((hint.includes("trend") || hint.includes("over time")) && hasTimeDim) {
    chartType = "line";
  }
  if (
    (hint.includes("breakdown") || hint.includes("share") || hint.includes("proportion")) &&
    availableChartTypes.includes("pie")
  ) {
    chartType = "pie";
  }
  const requested = parseRequestedChartType(hint);
  if (requested && availableChartTypes.includes(requested)) {
    chartType = requested;
  }

  const guarded = applyGuardrails(chartType, availableChartTypes, {
    hasTimeDim,
    dims: dims.length,
    measures: measures.length,
    rows,
  });

  return {
    chartType: guarded,
    availableChartTypes,
  };
}

function parseRequestedChartType(hint: string): ChartType | null {
  const h = hint.toLowerCase();
  if (/\b(pie|donut)\b/.test(h)) return "pie";
  if (/\b(table|tabular)\b/.test(h)) return "table";
  if (/\bline\b/.test(h)) return "line";
  if (/\b(bar|column)\b/.test(h)) return "bar";
  return null;
}

function applyGuardrails(
  chartType: ChartType,
  availableChartTypes: ChartType[],
  shape: { hasTimeDim: boolean; dims: number; measures: number; rows: number },
): ChartType {
  if (chartType === "line" && !shape.hasTimeDim) return "table";
  if (chartType === "pie" && !(shape.dims === 1 && shape.measures === 1 && shape.rows <= 6)) return "table";
  if (chartType === "bar" && !(shape.dims >= 1 && shape.measures >= 1 && shape.rows <= 50)) return "table";
  return availableChartTypes.includes(chartType) ? chartType : "table";
}

function tableOnly(): ChartChoice {
  return { chartType: "table", availableChartTypes: ["table"] };
}
