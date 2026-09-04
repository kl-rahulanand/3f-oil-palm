import { createHash } from "crypto";
import type { AuthoredMeasureInput, DomainSpec, MeasureSpec } from "@3f/contract";
import { trustedAuthoringDomain, trustedAuthoringField } from "./measure-authoring.catalog";

export function compileAuthoredMeasure(input: AuthoredMeasureInput, domain: DomainSpec): MeasureSpec {
  const authoringDomain = trustedAuthoringDomain(input.domain);
  if (!authoringDomain || domain.name !== input.domain) throw new Error("Dataset is not available for measure authoring");
  const baseField = trustedAuthoringField(input.domain, input.baseField);
  if (!baseField || !baseField.aggregations.includes(input.aggregation)) {
    throw new Error("Aggregation is not allowed for the selected field");
  }
  const timeDimension = input.timeDimension
    ? domain.dimensions.find((dimension) => dimension.id === input.timeDimension)
    : undefined;
  if (input.timeDimension && !authoringDomain.timeDimensions.some((item) => item.id === input.timeDimension)) {
    throw new Error("Time dimension is not available for measure authoring");
  }

  const impliedFilters = input.filters.map((filter) => {
    const field = trustedAuthoringField(input.domain, filter.fieldId);
    if (!field || !field.filterOperators.includes(filter.operator)) {
      throw new Error("Filter is not allowed for the selected field");
    }
    if (filter.operator === "is_not_null") return `${field.column} IS NOT NULL`;
    if (filter.operator === "in") {
      return `${field.column} IN (${filter.values.map(sqlLiteral).join(", ")})`;
    }
    const operator = filter.operator === "neq" ? "<>" : "=";
    return `${field.column} ${operator} ${sqlLiteral(filter.values[0])}`;
  });

  return {
    id: `${input.domain}.${input.key}`,
    label: input.label,
    synonyms: unique(input.synonyms),
    goldObject: domain.goldObject,
    expr: aggregationExpression(input.aggregation, baseField.column),
    grain: `authored over ${domain.label}`,
    impliedFilters,
    allowedDimensions: domain.dimensions.map((dimension) => dimension.id),
    ...(timeDimension ? { timeColumn: timeDimension.column, defaultTimeGrain: input.timeGrain } : {}),
    ...(input.format === "percent" ? { format: "percent" as const } : {}),
    piiSensitive: false,
  };
}

export function authoredMeasureDefinitionHash(input: AuthoredMeasureInput): string {
  const canonical = {
    ...input,
    synonyms: unique(input.synonyms).sort(),
    filters: input.filters.map((filter) => ({ ...filter, values: [...filter.values] })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24);
}

function aggregationExpression(aggregation: AuthoredMeasureInput["aggregation"], column: string): string {
  if (aggregation === "count") return column === "__row__" ? "COUNT(*)" : `COUNT(${column})`;
  if (aggregation === "count_distinct") return `COUNT(DISTINCT ${column})`;
  if (aggregation === "sum") return `SUM(${column})`;
  if (aggregation === "average") return `AVG(${column})`;
  if (aggregation === "minimum") return `MIN(${column})`;
  return `MAX(${column})`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
