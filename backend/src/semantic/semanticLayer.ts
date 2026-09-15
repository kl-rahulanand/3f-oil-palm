import { Injectable, Optional } from "@nestjs/common";
import { SEMANTIC_LABELS, type DomainSpec, type MeasureSpec, type DimensionSpec, type Permissions } from "@3f/contract";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";

/**
 * The semantic layer: verified measures/dimensions, code-in-repo and CI-gated (A2).
 * V1 registers verified domains as they are modeled.
 */
@Injectable()
export class SemanticLayer {
  private readonly baseDomains: DomainSpec[] = [
    {
      name: "governed-financial",
      label: "Governed financial",
      goldObject: "actual_by_gl_month",
      composed: {
        sources: ["actual_by_gl_month", "budget_by_gl_month"],
        joinKeys: ["gl_code", "month"],
      },
      scopeColumn: "plant",
      routingHints: ["actual versus budget", "financial performance", "budget percentage"],
      measures: [
        {
          id: "governed-financial.actual",
          label: SEMANTIC_LABELS.measures["governed-financial.actual"],
          format: "money",
          synonyms: ["actual", "actuals", "actual spend", "actual net", "spend"],
          goldObject: "actual_by_gl_month",
          expr: "SUM(actual_net)",
          grain: "gl_code and month",
          impliedFilters: [],
          allowedDimensions: ["gl_code", "month"],
          timeColumn: "month",
          defaultTimeGrain: "month",
          piiSensitive: false,
        },
        {
          id: "governed-financial.budget",
          label: SEMANTIC_LABELS.measures["governed-financial.budget"],
          format: "money",
          synonyms: ["budget", "budgeted", "budget net", "plan"],
          goldObject: "budget_by_gl_month",
          expr: "SUM(budget_net)",
          grain: "gl_code and month",
          impliedFilters: [],
          allowedDimensions: ["gl_code", "month"],
          timeColumn: "month",
          defaultTimeGrain: "month",
          piiSensitive: false,
        },
        {
          id: "governed-financial.percentage",
          label: SEMANTIC_LABELS.measures["governed-financial.percentage"],
          // The expression yields a RATIO (1.1455 = 114.6% of budget), so surfaces must be
          // told to render it as a percentage - without this the raw ratio reached the screen
          // at full database precision.
          format: "percent",
          synonyms: [
            "percentage",
            "percent",
            "percentage of budget",
            "actual versus budget percentage",
            "variance percentage",
          ],
          goldObject: "actual_by_gl_month",
          expr: `CASE
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) = 0 THEN NULL
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) > 0 THEN 'over-budget'
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) < 0 THEN 'credit / negative actual'
  ELSE (SUM(actual_net) / SUM(budget_net))::text
END`,
          grain: "gl_code and month",
          impliedFilters: [],
          allowedDimensions: ["gl_code", "month"],
          timeColumn: "month",
          defaultTimeGrain: "month",
          piiSensitive: false,
        },
      ],
      dimensions: [
        { id: "gl_code", label: SEMANTIC_LABELS.dimensions.gl_code, column: "gl_code" },
        { id: "month", label: SEMANTIC_LABELS.dimensions.month, column: "month" },
      ],
    },
    {
      name: "mis-statement",
      label: "MIS statement",
      goldObject: "statement_relation",
      composed: {
        sources: ["actual_by_key_month", "budget_by_leaf_month"],
        joinKeys: ["leaf_key", "month"],
      },
      scopeColumn: "plant",
      routingHints: ["MIS statement", "financial statement", "budget statement"],
      measures: [
        statementMeasure(
          "actual_net",
          SEMANTIC_LABELS.measures["mis-statement.actual_net"],
          ["statement actual", "mis statement actual", "actual by statement leaf", "actual net by leaf"],
          "SUM(actual_net)",
        ),
        statementMeasure(
          "budget_net",
          SEMANTIC_LABELS.measures["mis-statement.budget_net"],
          ["statement budget", "mis statement budget", "budget by statement leaf", "budget net by leaf"],
          "SUM(budget_net)",
        ),
        statementMeasure(
          "rollover_net",
          SEMANTIC_LABELS.measures["mis-statement.rollover_net"],
          ["roll-over", "rollover", "roll over", "rollover net", "statement roll-over"],
          "SUM(rollover_net)",
        ),
        statementMeasure(
          "percentage",
          SEMANTIC_LABELS.measures["mis-statement.percentage"],
          ["statement percentage", "mis statement percentage", "percentage by statement leaf"],
          `CASE
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) = 0 THEN NULL
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) > 0 THEN 'over-budget'
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) < 0 THEN 'credit / negative actual'
  ELSE (SUM(actual_net) / SUM(budget_net))::text
END`,
        ),
      ],
      dimensions: [{ id: "leaf_key", label: SEMANTIC_LABELS.dimensions.leaf_key, column: "leaf_key" }],
    },
  ];

  constructor(@Optional() private readonly authored?: AuthoredMeasureRegistry) {}

  all(): DomainSpec[] {
    return this.baseDomains.map((domain) => this.withAuthoredMeasures(domain));
  }

  /** Domains restricted to what the user is permitted to use (semantic authorization). */
  allowedFor(perms: Permissions): DomainSpec[] {
    return this.all()
      .filter((d) => perms.domains.includes(d.name))
      .map((d) => ({
        ...d,
        measures: d.measures.filter((m) => perms.measureIds.includes(m.id)),
        dimensions: d.dimensions.filter((dim) => perms.dimensionIds.includes(dim.id)),
      }));
  }

  domain(name: string): DomainSpec | undefined {
    const domain = this.baseDomains.find((candidate) => candidate.name === name);
    return domain ? this.withAuthoredMeasures(domain) : undefined;
  }

  measure(domain: string, measureId: string): MeasureSpec | undefined {
    return this.domain(domain)?.measures.find((m) => m.id === measureId);
  }

  dimension(domain: string, dimId: string): DimensionSpec | undefined {
    return this.domain(domain)?.dimensions.find((d) => d.id === dimId);
  }

  private withAuthoredMeasures(domain: DomainSpec): DomainSpec {
    const authored = this.authored?.published(domain.name) ?? [];
    return authored.length ? { ...domain, measures: [...domain.measures, ...authored] } : domain;
  }
}

function statementMeasure(id: string, label: string, synonyms: string[], expr: string): MeasureSpec {
  return {
    id: `mis-statement.${id}`,
    label,
    // Same ratio-not-number problem as governed-financial.percentage; every other
    // statement measure is a fixed-scale Rupee amount.
    format: id === "percentage" ? ("percent" as const) : ("money" as const),
    // The governed-financial domain publishes measures under the SAME labels ("Actual",
    // "Budget", "%"), so an unqualified "Actual" was ambiguous and the selector could not
    // choose - it degraded to a glossary definition roughly one ask in three. These
    // synonyms name the statement explicitly so the two domains are separable by wording;
    // none of them may repeat a governed-financial synonym or the ambiguity returns.
    synonyms,
    goldObject: "statement_relation",
    expr,
    grain: "statement leaf and period range",
    impliedFilters: [],
    allowedDimensions: ["leaf_key"],
    timeColumn: "month",
    defaultTimeGrain: "month",
    piiSensitive: false,
  };
}
