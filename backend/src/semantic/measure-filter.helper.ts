import { MeasureFilterInvalidReason, type DomainSpec, type MeasureFilter, type Selection } from "@3f/contract";
import { MeasureFilterInvalidException } from "./measure-filter-invalid.exception";

const VALUE_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function normalizeMeasureFilters(domain: DomainSpec, filters: MeasureFilter[] | undefined): MeasureFilter[] {
  const normalized: MeasureFilter[] = [];
  const seen = new Set<string>();

  for (const filter of filters ?? []) {
    const left = domain.measures.find(({ id }) => id === filter.measureId);
    if (!left) refuse(MeasureFilterInvalidReason.UnknownMeasure);
    if (left.format !== "money") refuse(MeasureFilterInvalidReason.NotComparable);

    let compareTo = filter.compareTo;
    if (compareTo.kind === "measure") {
      const rightId = compareTo.measureId;
      const right = domain.measures.find(({ id }) => id === rightId);
      if (!right) refuse(MeasureFilterInvalidReason.UnknownMeasure);
      if (right.format !== "money") refuse(MeasureFilterInvalidReason.NotComparable);
      if (rightId === filter.measureId) refuse(MeasureFilterInvalidReason.SelfComparison);
    } else {
      if (!VALUE_PATTERN.test(compareTo.value)) refuse(MeasureFilterInvalidReason.MalformedValue);
      const [integer, fraction = ""] = compareTo.value.split(".");
      const value = /^-0+$/.test(integer) && /^0*$/.test(fraction) ? "0.00" : `${integer}.${fraction.padEnd(2, "0")}`;
      compareTo = { kind: "value", value };
    }

    const entry = { ...filter, compareTo };
    const key = `${filter.measureId}\0${filter.op}\0${
      compareTo.kind === "measure" ? `measure\0${compareTo.measureId}` : `value\0${compareTo.value}`
    }`;
    if (seen.has(key)) refuse(MeasureFilterInvalidReason.Duplicate);
    seen.add(key);
    normalized.push(entry);
  }

  return normalized;
}

export function operandMeasureIds(selection: Selection): string[] {
  const ids = new Set(selection.measureIds);
  for (const filter of selection.measureFilters ?? []) {
    ids.add(filter.measureId);
    if (filter.compareTo.kind === "measure") ids.add(filter.compareTo.measureId);
  }
  return [...ids];
}

export function canonicalizeSelection(domain: DomainSpec, selection: Selection): Selection {
  if (!selection.measureFilters) return selection;
  const measureFilters = normalizeMeasureFilters(domain, selection.measureFilters);
  return { ...selection, measureFilters, measureIds: operandMeasureIds({ ...selection, measureFilters }) };
}

function refuse(reason: MeasureFilterInvalidReason): never {
  throw new MeasureFilterInvalidException(reason);
}
