import { BadRequestException } from "@nestjs/common";
import type { AuthUser, MeasureSpec, Selection } from "@3f/contract";
import { operandMeasureIds } from "./measure-filter.helper";
import { SemanticLayer } from "./semanticLayer";

export function validateSelectionForUser(semantic: SemanticLayer, user: AuthUser, selection: Selection): MeasureSpec[] {
  const domain = semantic.domain(selection.domain);
  if (!domain || !user.permissions.domains.includes(selection.domain)) {
    throw new BadRequestException(`Unknown or not permitted domain: ${selection.domain}`);
  }

  const measures: MeasureSpec[] = [];
  for (const measureId of operandMeasureIds(selection)) {
    const measure = semantic.measure(selection.domain, measureId);
    if (!measure || !user.permissions.measureIds.includes(measureId)) {
      throw new BadRequestException(`Measure not available: ${measureId}`);
    }
    measures.push(measure);
  }

  const dimensionIds = new Set([...selection.dimensionIds, ...selection.filters.map(({ dimensionId }) => dimensionId)]);
  const grantedPlants = new Set(user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value));
  const selectedPlants = selection.filters
    .filter(({ dimensionId }) => dimensionId === "plant")
    .flatMap(({ value }) => (Array.isArray(value) ? value : [value]));
  for (const dimensionId of dimensionIds) {
    const permitted =
      dimensionId === "plant"
        ? selectedPlants.every((plant) => grantedPlants.has(plant))
        : user.permissions.dimensionIds.includes(dimensionId);
    if (!semantic.dimension(selection.domain, dimensionId) || !permitted) {
      throw new BadRequestException(`Dimension not available: ${dimensionId}`);
    }
  }

  return measures;
}
