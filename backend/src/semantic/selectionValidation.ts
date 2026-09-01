import { BadRequestException } from "@nestjs/common";
import type { AuthUser, MeasureSpec, Selection } from "@pulse/contract";
import { SemanticLayer } from "./semanticLayer";

export function validateSelectionForUser(
  semantic: SemanticLayer,
  user: AuthUser,
  selection: Selection,
): MeasureSpec[] {
  const domain = semantic.domain(selection.domain);
  if (!domain || !user.permissions.domains.includes(selection.domain)) {
    throw new BadRequestException(`Unknown or not permitted domain: ${selection.domain}`);
  }

  const measures: MeasureSpec[] = [];
  for (const measureId of selection.measureIds) {
    const measure = semantic.measure(selection.domain, measureId);
    if (!measure || !user.permissions.measureIds.includes(measureId)) {
      throw new BadRequestException(`Measure not available: ${measureId}`);
    }
    measures.push(measure);
  }

  for (const dimensionId of selection.dimensionIds) {
    if (!semantic.dimension(selection.domain, dimensionId) || !user.permissions.dimensionIds.includes(dimensionId)) {
      throw new BadRequestException(`Dimension not available: ${dimensionId}`);
    }
  }

  return measures;
}
