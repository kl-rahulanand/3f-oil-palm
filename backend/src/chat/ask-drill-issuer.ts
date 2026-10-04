import type { AskResponse, AuthUser, ProvenanceBatch, ResultTable, Selection } from "@3f/contract";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { StatementAttestationService } from "../mis/statement-attestation";
import type { DrillPredicate, IDrillTransactionsRepository } from "../warehouse/drill-transactions.interface";
import type { IPinnedStatementOutlineRepository } from "../warehouse/statement-outline.interface";
import type { AskDrillContextRow, AskDrillContextService } from "./ask-drill-context";

const MAX_EXACT_RUPEES = 2 ** 46;

export type AskDrillAnswerShape =
  | {
      kind: "gl";
      dimensionId: "gl_code";
      actualMeasureId: "governed-financial.actual";
      actualColumn: "actual";
    }
  | {
      kind: "statement";
      dimensionId: "leaf_key";
      actualMeasureId: "mis-statement.actual_net";
      actualColumn: "actual_net";
    };

export interface AskDrillPreparedAnswer {
  user: AuthUser;
  selection: Selection;
  result: ResultTable;
  shape: AskDrillAnswerShape;
  rowKeys: string[];
  actualPins: Array<ProvenanceBatch & { source: "actuals" }>;
  budgetPin?: ProvenanceBatch;
  range: { from: string; to: string } | null;
  plants: string[];
  predicates: Array<{ rowKey: string; predicate: DrillPredicate }>;
}

export interface AskDrillIssuerDependencies {
  transactions: Pick<IDrillTransactionsRepository, "summarize">;
  contexts: Pick<AskDrillContextService, "issue">;
  outlines: Pick<IPinnedStatementOutlineRepository, "findByBudgetBatchId">;
  statementAttestation: Pick<StatementAttestationService, "outlineDigest">;
}

export interface IssuedAskDrill {
  drill?: NonNullable<AskResponse["drill"]>;
  dataMismatchRowKeys: string[];
}

export async function issueAskDrill(
  deps: AskDrillIssuerDependencies,
  answer: AskDrillPreparedAnswer,
): Promise<IssuedAskDrill> {
  const { user, selection, shape, rowKeys, actualPins, range, plants, predicates } = answer;
  const actualAuthorized =
    selection.measureIds.includes(shape.actualMeasureId) &&
    user.permissions.measureIds.includes(shape.actualMeasureId) &&
    user.permissions.domains.includes(selection.domain);
  if (
    !actualAuthorized ||
    !range ||
    actualPins.length === 0 ||
    predicates.length !== rowKeys.length ||
    rowKeys.length === 0
  ) {
    return { dataMismatchRowKeys: [] };
  }

  const displayed = answer.result.rows.map((row) => displayedActual(row[shape.actualColumn]));
  if (displayed.some((actual) => actual === null)) return { dataMismatchRowKeys: [] };
  const exactPredicates = predicates.filter((_, index) => displayed[index]?.kind === "exact");
  const summaries = exactPredicates.length ? await deps.transactions.summarize(exactPredicates) : [];
  const summaryByKey = new Map(summaries.map((summary) => [summary.rowKey, summary]));
  const dataMismatchRowKeys: string[] = [];
  const rows = rowKeys.map((key, index): AskDrillContextRow => {
    const actual = displayed[index]!;
    const predicate = predicates[index]!.predicate;
    const triples = shape.kind === "statement" ? predicateTriples(predicate) : undefined;
    const identity = {
      key,
      plants: predicate.plants,
      ...(predicate.mode === "gl-and-plants" ? { glCode: predicate.glCode } : {}),
      ...(triples ? { triples } : {}),
    };
    if (actual.kind === "oversized") return { ...identity, drillable: false };

    const summary = summaryByKey.get(key);
    const matches = summary !== undefined && decimalToPaise(summary.value) === actual.paise;
    if (!matches) dataMismatchRowKeys.push(key);
    return {
      ...identity,
      actualPaise: actual.paise,
      drillable: Boolean(matches && summary.feedingLineCount > 0),
    };
  });
  const budget = answer.budgetPin
    ? {
        pin: answer.budgetPin,
        outlineDigest: deps.statementAttestation.outlineDigest(
          await deps.outlines.findByBudgetBatchId(answer.budgetPin.batchId),
          selection.measureIds,
        ),
      }
    : undefined;
  const context = deps.contexts.issue({
    userId: user.id,
    selection,
    plants,
    pinnedActuals: actualPins,
    ...(budget ? { budget } : {}),
    ...(shape.kind === "statement" ? { mappingMasterVersion: MAPPING_MASTER.version } : {}),
    rows,
  });
  return {
    drill: { context, rows: rows.map(({ key, drillable }) => ({ key, drillable })) },
    dataMismatchRowKeys,
  };
}

function displayedActual(
  value: string | number | null | undefined,
): { kind: "exact"; paise: string } | { kind: "oversized" } | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (Math.abs(numeric) >= MAX_EXACT_RUPEES) return { kind: "oversized" };
  return { kind: "exact", paise: decimalToPaise(numeric.toFixed(2)) };
}

function decimalToPaise(value: string): string {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) throw new Error("Ask drill money is not exact fixed-scale text");
  return BigInt(`${match[1]}${match[2]}${match[3]}`).toString();
}

function predicateTriples(
  predicate: DrillPredicate,
): Array<{ plant: string; costCenter: string; glCode: string }> | undefined {
  return predicate.mode === "gl-and-plants" ? undefined : predicate.triples;
}
