import type {
  MeasureAggregation,
  MeasureAuthoringDomain,
} from "@3f/contract";

type TrustedField = MeasureAuthoringDomain["fields"][number] & { column: string };
type TrustedDomain = Omit<MeasureAuthoringDomain, "fields"> & { fields: TrustedField[] };

export const AUTHORING_DOMAINS: TrustedDomain[] = [];

export const AGGREGATION_OPTIONS = [
  { id: "count", label: "Count" },
  { id: "count_distinct", label: "Count distinct" },
  { id: "sum", label: "Sum" },
  { id: "average", label: "Average" },
  { id: "minimum", label: "Minimum" },
  { id: "maximum", label: "Maximum" },
] satisfies Array<{ id: MeasureAggregation; label: string }>;

export function trustedAuthoringDomain(id: string): TrustedDomain | undefined {
  return AUTHORING_DOMAINS.find((domain) => domain.id === id);
}

export function trustedAuthoringField(
  domainId: string,
  fieldId: string,
): TrustedField | undefined {
  return trustedAuthoringDomain(domainId)?.fields.find((field) => field.id === fieldId);
}
