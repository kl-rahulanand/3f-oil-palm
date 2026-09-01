import type { ChartType, Selection } from "@pulse/contract";
import { loadConfig } from "../config";

export interface ReportSpec {
  id: string;
  title: string;
  description: string;
  domain: string;
  measureIds: string[];
  dimensionIds: string[];
  chartType: ChartType;
  timeWindow?: Selection["timeWindow"];
  primaryMeasureId?: string;
  approximate?: boolean;
  note?: string;
}

export const REPORTS: ReportSpec[] = [];

export function reportSelection(spec: ReportSpec): Selection {
  return {
    domain: spec.domain,
    measureIds: spec.measureIds,
    dimensionIds: spec.dimensionIds,
    filters: [],
    ...(spec.timeWindow ? { timeWindow: spec.timeWindow } : {}),
    limit: loadConfig().maxRows,
  };
}
