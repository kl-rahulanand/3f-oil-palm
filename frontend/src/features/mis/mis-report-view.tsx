"use client";

import type { MisSelectionRunRequest, MisStatementRunRequest } from "@3f/contract";
import { MessageSquareText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/button";
import { AskPanel, parseActiveBatchIds } from "@/src/features/assistant/ask-panel";
import { StatementView } from "./statement-view";
import { useMisStatement } from "./use-mis-statement";

const EMPTY_SELECTION: MisSelectionRunRequest = { department: "", function: "", plant: "", period: "" };
export function MisReportView() {
  const { options, run } = useMisStatement();
  const searchParams = useSearchParams();
  const linked = useMemo(() => linkedStatementRequest(searchParams), [searchParams]);
  const requestedLink = useRef<string | undefined>(undefined);
  const [selection, setSelection] = useState<MisSelectionRunRequest>(editableSelection(linked.request));
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    if (!linked.request) {
      requestedLink.current = undefined;
      return;
    }
    const signature = JSON.stringify(linked.request);
    if (signature === requestedLink.current) return;
    requestedLink.current = signature;
    setSelection(editableSelection(linked.request));
    run.mutate(linked.request);
  }, [linked, run]);

  function update(field: keyof MisSelectionRunRequest, value: string) {
    setSelection((current) => ({ ...current, [field]: value }));
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    run.mutate(selection);
  }

  return (
    <div className="mis-ask-layout">
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
            options={options.data?.plants.map(({ value, label, provisional }) => ({ value, label, provisional })) ?? []}
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

        {linked.invalidBatches ? (
          <StatusMessage error>The report link is invalid. Return to Ask and open it again.</StatusMessage>
        ) : (
          <>
            {options.isError && (
              <StatusMessage error>Selection options could not be loaded. Refresh the page to try again.</StatusMessage>
            )}
            {run.isError && (
              <StatusMessage error>The report could not be generated. Check the selection and try again.</StatusMessage>
            )}
            {!run.data && !run.isPending && !run.isError && !options.isError && (
              <div className="mis-empty-state">
                <div className="mis-empty-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <strong>Select Department, Function and Plant, then Generate</strong>
                <p>
                  Actuals are read from SAP for the selected period. Nothing is written back — this report is read-only.
                </p>
              </div>
            )}
            {run.isSuccess &&
              (run.data.outcome === "refresh-required" ? (
                <StatusMessage error>{run.data.notice}</StatusMessage>
              ) : (
                <StatementView response={run.data} />
              ))}
          </>
        )}
      </section>
      {askOpen ? (
        <AskPanel surface="docked" onCollapse={() => setAskOpen(false)} />
      ) : (
        <button className="ask-rail" type="button" onClick={() => setAskOpen(true)}>
          <MessageSquareText size={17} aria-hidden="true" />
          <span>Assistant</span>
        </button>
      )}
    </div>
  );
}

function linkedStatementRequest(searchParams: URLSearchParams): {
  request?: MisStatementRunRequest;
  invalidBatches: boolean;
} {
  const department = searchParams.get("department");
  const functionName = searchParams.get("function");
  const plant = searchParams.get("plant");
  const period = searchParams.get("period");
  if (!department || !functionName || !plant || !period) return { invalidBatches: false };
  const activeBatchIds = searchParams.get("activeBatchIds");
  const pinnedBatches = parseActiveBatchIds(activeBatchIds);
  if (activeBatchIds !== null && !pinnedBatches) return { invalidBatches: true };
  return {
    request: { department, function: functionName, plant, period, ...(pinnedBatches ? { pinnedBatches } : {}) },
    invalidBatches: false,
  };
}

function editableSelection(request?: MisStatementRunRequest): MisSelectionRunRequest {
  if (!request) return EMPTY_SELECTION;
  const { department, function: functionName, plant, period } = request;
  return { department, function: functionName, plant, period };
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string; provisional?: boolean }>;
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
            {option.provisional ? " — Provisional labels" : ""}
          </option>
        ))}
      </select>
    </label>
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
