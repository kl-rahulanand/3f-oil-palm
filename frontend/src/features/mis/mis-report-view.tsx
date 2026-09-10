"use client";

import type {
  MisSelectionOptionsResponse,
  MisSelectionResolvedResponse,
  MisSelectionRunRequest,
  MisSelectionRunResponse,
  ResultTable,
} from "@3f/contract";
import { useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/button";
import { useMisSelection } from "./use-mis-selection";

const EMPTY_SELECTION: MisSelectionRunRequest = { department: "", function: "", plant: "", period: "" };
const amountFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const percentageFormatter = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });
const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function MisReportView() {
  const { options, run } = useMisSelection();
  const [selection, setSelection] = useState(EMPTY_SELECTION);

  function update(field: keyof MisSelectionRunRequest, value: string) {
    setSelection((current) => ({ ...current, [field]: value }));
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    run.mutate(selection);
  }

  return (
    <section className="mis-report">
      <header className="mis-report-header">
        <p className="mis-eyebrow">Governed financial view</p>
        <h1>MIS Reports</h1>
        <p>Resolve a nursery selection to its approved scope and review the resulting Actual and Budget values.</p>
      </header>

      <form className="mis-filter-bar" onSubmit={generate}>
        <SelectField
          label="Department"
          value={selection.department}
          options={options.data?.departments.map((value) => ({ value, label: value })) ?? []}
          onChange={(value) => update("department", value)}
        />
        <SelectField
          label="Function"
          value={selection.function}
          options={options.data?.functions.map((value) => ({ value, label: value })) ?? []}
          onChange={(value) => update("function", value)}
        />
        <SelectField
          label="Plant"
          value={selection.plant}
          options={options.data?.plants.map(({ value, label }) => ({ value, label })) ?? []}
          onChange={(value) => update("plant", value)}
        />
        <SelectField
          label="Period"
          value={selection.period}
          options={options.data?.periods.map(({ value, label }) => ({ value, label })) ?? []}
          onChange={(value) => update("period", value)}
        />
        <Button
          className="mis-generate"
          type="submit"
          disabled={options.isPending || run.isPending || !isComplete(selection)}
        >
          {run.isPending ? "Generating…" : "Generate"}
        </Button>
      </form>

      {options.isError && (
        <StatusMessage error>Selection options could not be loaded. Refresh the page to try again.</StatusMessage>
      )}
      {run.isError && (
        <StatusMessage error>The report could not be generated. Check the selection and try again.</StatusMessage>
      )}
      {!run.data && !options.isError && (
        <div className="mis-empty-state">
          <div className="mis-empty-icon" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>Select Department, Function and Plant, then Generate</strong>
          <p>Actuals are read from SAP for the selected period. Nothing is written back — this report is read-only.</p>
        </div>
      )}
      {run.data && <ReportResult response={run.data} options={options.data} />}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}>) {
  const id = `mis-${label.toLowerCase()}`;
  return (
    <label className="mis-filter" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportResult({
  response,
  options,
}: Readonly<{ response: MisSelectionRunResponse; options: MisSelectionOptionsResponse | undefined }>) {
  const resolved = response.outcome === "resolved";
  return (
    <div className="mis-results" aria-live="polite">
      {!resolved && (
        <div className="mis-notice" role="status">
          <strong>{response.notice}</strong>
          <span>This selection has no governed scope yet. Its report values remain zero.</span>
        </div>
      )}
      {resolved && <ScopeReadout response={response} options={options} />}
      <Totals response={response} />
      {resolved && <ResultRows response={response} />}
      {resolved && <BucketRows response={response} />}
    </div>
  );
}

function ScopeReadout({
  response,
  options,
}: Readonly<{ response: MisSelectionResolvedResponse; options: MisSelectionOptionsResponse | undefined }>) {
  const period = options?.periods.find(({ value }) => value === response.scope.period)?.label ?? response.scope.period;
  return (
    <section className="mis-scope" aria-labelledby="mis-scope-title">
      <h2 id="mis-scope-title">Resolved scope</h2>
      <p>
        Plant = {response.scope.plant} · Cost centres = {response.scope.costCentres.join(", ")} · GL codes ={" "}
        {response.scope.glCodes.join(", ")} · MIS format = {response.scope.misFormat} · Period = {period}
      </p>
    </section>
  );
}

function Totals({ response }: Readonly<{ response: MisSelectionRunResponse }>) {
  return (
    <section className="mis-totals" aria-label="Report totals">
      <div>
        <span>Actual</span>
        <strong>{formatAmount(response.totals.actual)}</strong>
      </div>
      <div>
        <span>Budget</span>
        <strong>{formatAmount(response.totals.budget)}</strong>
      </div>
      <div>
        <span>Actual vs Budget</span>
        <strong>
          {response.totals.percentage === null ? "—" : percentageFormatter.format(response.totals.percentage)}
        </strong>
      </div>
    </section>
  );
}

function ResultRows({ response }: Readonly<{ response: MisSelectionResolvedResponse }>) {
  if (response.result.rows.length === 0) {
    return <div className="mis-configured-zero">Mapping configured. No transactions were found for this period.</div>;
  }
  return (
    <section className="mis-result-card" aria-labelledby="mis-result-title">
      <h2 id="mis-result-title">Governed result</h2>
      <div className="mis-table-scroll">
        <table className="mis-table">
          <thead>
            <tr>
              {response.result.columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {response.result.rows.map((row, index) => (
              <tr key={index}>
                {response.result.columns.map((column) => (
                  <td key={column.key} data-numeric={column.numeric || undefined}>
                    {formatCell(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BucketRows({ response }: Readonly<{ response: MisSelectionResolvedResponse }>) {
  if (response.bucketRows.length === 0) return null;
  return (
    <section className="mis-bucket" aria-labelledby="mis-bucket-title">
      <div>
        <p className="mis-eyebrow">Mapping gap</p>
        <h2 id="mis-bucket-title">Unmapped GL review</h2>
        <p>These rows remain visible until the authoritative MIS mapping is confirmed.</p>
      </div>
      <ul>
        {response.bucketRows.map((row) => (
          <li key={`${row.plant}-${row.glCode}`}>
            <div className="mis-bucket-triple">
              <span>{row.plant}</span>
              <span>{formatCostCentres(row.costCentres)}</span>
              <strong>{row.glCode}</strong>
            </div>
            <div className="mis-bucket-amounts">
              <span>Actual {formatAmount(row.actual)}</span>
              <span>Budget {formatAmount(row.budget)}</span>
            </div>
            <p>{row.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusMessage({ children, error = false }: Readonly<{ children: string; error?: boolean }>) {
  return (
    <p className="mis-status" data-error={error || undefined} role={error ? "alert" : "status"}>
      {children}
    </p>
  );
}

function isComplete(selection: MisSelectionRunRequest): boolean {
  return Object.values(selection).every(Boolean);
}

function formatAmount(value: number): string {
  return `₹${amountFormatter.format(value)}`;
}

function formatCostCentres(costCentres: string[]): string {
  if (costCentres.length === 0) return "No cost centre in master";
  return costCentres.length === 1 ? costCentres[0] : `${costCentres.length} cost centres`;
}

function formatCell(value: string | number | null, column: ResultTable["columns"][number]): string {
  if (value === null) return "—";
  if (column.key === "month" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return monthFormatter.format(new Date(`${value}T00:00:00Z`));
  }
  const numericValue = Number(value);
  if (column.numeric && !Number.isFinite(numericValue)) return String(value);
  if (column.format === "percent") return percentageFormatter.format(numericValue);
  return column.numeric ? numberFormatter.format(numericValue) : String(value);
}
