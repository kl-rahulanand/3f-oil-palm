import type { MisStatementResolvedResponse, StatementGroundingResponse } from "@3f/contract";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StatementExplanation } from "./statement-explanation";

const line = {
  month: "2026-07-01",
  postingDate: "2026-07-12",
  txnNo: "1900001234",
  costCenter: "DUB-NUR",
  accountName: "Shade Net Material",
  debit: "50.00" as const,
  credit: "0.00" as const,
  value: "50.00" as const,
  reference: "SAP-1",
  memo: "Shade net",
};
const leaf = {
  nodeKey: "shade",
  leafKey: "shade",
  block: "selected" as const,
  budgetState: "loaded" as const,
  rollup: [
    {
      plant: "DUB",
      costCentre: "Primary",
      glCode: "5001",
      bucket: "Materials",
      mappingTarget: { kind: "leaf" as const, leafKey: "shade" },
      provisional: false,
      reason: null,
    },
  ],
  transactions: {
    lines: [line],
    footer: { debit: "50.00" as const, credit: "0.00" as const, value: "50.00" as const },
    totalCount: 21,
    pageSize: 20 as const,
  },
};

afterEach(cleanup);

test("all seven outcome variants render their own copy and none falls through to the generic message", () => {
  const outcomes: Array<[StatementGroundingResponse, string]> = [
    [{ outcome: "focus-required" }, "Click an Actual to choose the figure"],
    [{ outcome: "leaf", ...leaf }, "Transactions behind this figure"],
    [
      {
        outcome: "replaced",
        ...leaf,
        notice: "actuals July 2026 was replaced",
        replacedBatches: [replacedBatch()],
      },
      "This explanation uses a replaced batch",
    ],
    [
      {
        outcome: "aggregate",
        nodeKey: "materials",
        block: "selected",
        budgetState: "loaded",
        instruction: "project-descendants-from-attested-statement",
      },
      "Lines that compose this figure",
    ],
    [
      { outcome: "gone", batchStatuses: [{ ...replacedBatch(), status: "gone" }], message: "gone" },
      "Generate the statement again",
    ],
    [
      { outcome: "audit-failure", message: "The explanation could not be safely audited." },
      "could not be safely audited",
    ],
    [{ outcome: "refused", reason: "wrong-user" }, "This statement context belongs to another user"],
  ];

  for (const [response, copy] of outcomes) {
    const view = render(<StatementExplanation response={response} statement={statement()} onOpenDrill={vi.fn()} />);
    expect(screen.getByText(new RegExp(copy, "i"))).toBeInTheDocument();
    expect(screen.queryByText("The assistant could not answer.")).not.toBeInTheDocument();
    view.unmount();
  }
});

test("the replaced variant shows its notice and replaced batches alongside the full explanation", () => {
  render(
    <StatementExplanation
      response={{
        outcome: "replaced",
        ...leaf,
        notice: "The Actual batch changed after this statement was generated.",
        replacedBatches: [replacedBatch()],
      }}
      statement={statement()}
      onOpenDrill={vi.fn()}
    />,
  );

  expect(screen.getByRole("status")).toHaveTextContent("The Actual batch changed after this statement was generated.");
  expect(screen.getByRole("status")).toHaveTextContent("actuals · 2026-07-01");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("GL 5001 · Primary · Materials")).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Transactions behind this figure" })).toHaveTextContent("SAP-1");
  expect(screen.getByText("21 total lines · first 20 shown")).toBeInTheDocument();
});

test("the explanation offers a control that opens the drill panel on the focused node", () => {
  const onOpenDrill = vi.fn();
  render(
    <StatementExplanation response={{ outcome: "leaf", ...leaf }} statement={statement()} onOpenDrill={onOpenDrill} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open full drill" }));

  expect(onOpenDrill).toHaveBeenCalledWith("shade", "selected", expect.any(HTMLButtonElement));
});

test("the aggregate response renders descendant values from the held statement and issues no request", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(
    <StatementExplanation
      response={{
        outcome: "aggregate",
        nodeKey: "materials",
        block: "selected",
        budgetState: "loaded",
        instruction: "project-descendants-from-attested-statement",
      }}
      statement={statement()}
      onOpenDrill={vi.fn()}
    />,
  );

  expect(screen.getByText("Shade Net")).toBeInTheDocument();
  expect(screen.getByText("₹50")).toBeInTheDocument();
  expect(screen.getByText("GL 5001 · Primary")).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

function replacedBatch() {
  return {
    source: "actuals" as const,
    period: "2026-07-01",
    requestedBatchId: "old",
    status: "replaced" as const,
    activeBatchId: "new",
  };
}

function statement(): MisStatementResolvedResponse {
  const measure = {
    key: "selected" as const,
    label: "July 2026",
    from: "2026-07-01",
    to: "2026-07-01",
    budgetState: "loaded" as const,
    budget: "100.00" as const,
    rollover: null,
    actual: "50.00" as const,
    percentage: "0.5",
    sourcePresence: ["matched" as const],
  };
  const shade = {
    nodeKey: "shade",
    sNo: "4.1",
    budgetComponent: "Shade Net",
    glCode: "5001",
    measures: [measure],
    children: [],
  };
  return {
    outcome: "resolved",
    scope: {
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
      costCentres: ["Primary"],
      glCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
    },
    tree: [{ ...shade, nodeKey: "materials", budgetComponent: "Materials", glCode: null, children: [shade] }],
    grandTotal: { ...shade, nodeKey: "grand-total", budgetComponent: "Grand Total", glCode: null },
    provenance: { activeBatchIds: [] },
    nodeMetadata: [{ nodeKey: "shade", glCodes: ["5001"], costCentres: ["Primary"] }],
  };
}
