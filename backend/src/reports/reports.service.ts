import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser, DomainSpec, ReportRunResult, ReportSummary, Selection } from "@3f/contract";
import { WAREHOUSE } from "../config";
import { defaultTimeColumn, SelectionExecutor, validDateColumns } from "../chat/selectionExecutor";
import { REPORTS, reportSelection, type ReportSpec } from "../semantic/reports";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";
import type { Warehouse } from "../warehouse/warehouse.interface";

export type ReportRunTimeWindowOverride = { from: string; to: string; column?: string };

export interface AuthorizedReportSelection {
  report: ReportSpec;
  selection: Selection;
  domain: DomainSpec;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly semantic: SemanticLayer,
    private readonly selectionExecutor: SelectionExecutor,
    @Inject(WAREHOUSE) private readonly warehouse: Warehouse,
  ) {}

  list(user: AuthUser): ReportSummary[] {
    return REPORTS.filter((report) => this.canRunReport(user, report)).map((report) => ({
      id: report.id,
      title: report.title,
      description: report.description,
      domain: report.domain,
      chartType: report.chartType,
      approximate: report.approximate ?? false,
      note: report.note,
    }));
  }

  async run(
    user: AuthUser,
    id: string,
    override?: ReportRunTimeWindowOverride,
  ): Promise<ReportRunResult> {
    const { report, selection, domain } = this.resolveAuthorizedSelection(user, id, override);
    const execution = await this.selectionExecutor.run(user, domain, selection);
    const dataAsOf = await this.selectionExecutor.freshness(domain).catch(() => null);
    const validCols = Array.from(validDateColumns(domain));
    const dateColumns = validCols.map((col) => ({
      value: col,
      label: domain.dimensions.find((dimension) => dimension.column === col)?.label ?? col,
    }));
    const defaultDateColumn = defaultTimeColumn(domain, selection) ?? null;

    return {
      id: report.id,
      title: report.title,
      description: report.description,
      result: execution.result,
      chartType: report.chartType,
      primaryMeasureId: report.primaryMeasureId ?? report.measureIds[0],
      approximate: report.approximate ?? false,
      note: report.note,
      dataAsOf,
      appliedTimeWindow: execution.appliedTimeWindow ?? null,
      dateColumns,
      defaultDateColumn,
    };
  }

  resolveAuthorizedSelection(
    user: AuthUser,
    id: string,
    override?: ReportRunTimeWindowOverride,
  ): AuthorizedReportSelection {
    const report = REPORTS.find((item) => item.id === id);
    if (!report) throw new NotFoundException("Report not found");

    const selection = reportSelection(report);
    if (override?.from && override?.to) {
      selection.timeWindow = {
        grain: "day",
        from: override.from,
        to: override.to,
        ...(override.column ? { column: override.column } : {}),
      };
    }

    validateSelectionForUser(this.semantic, user, selection);

    const domain = this.semantic.domain(selection.domain);
    if (!domain) throw new NotFoundException("Report domain not found");
    return { report, selection, domain };
  }

  private canRunReport(user: AuthUser, report: ReportSpec): boolean {
    if (!this.semantic.domain(report.domain)) return false;
    if (!user.permissions.domains.includes(report.domain)) return false;

    for (const measureId of report.measureIds) {
      if (!this.semantic.measure(report.domain, measureId)) return false;
      if (!user.permissions.measureIds.includes(measureId)) return false;
    }

    for (const dimensionId of report.dimensionIds) {
      if (!this.semantic.dimension(report.domain, dimensionId)) return false;
      if (!user.permissions.dimensionIds.includes(dimensionId)) return false;
    }
    return true;
  }
}
