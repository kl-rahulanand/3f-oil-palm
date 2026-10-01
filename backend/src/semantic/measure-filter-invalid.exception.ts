import { BadRequestException } from "@nestjs/common";
import { MeasureFilterInvalidReason } from "@3f/contract";

export const MEASURE_FILTER_INVALID_MESSAGES: Record<MeasureFilterInvalidReason, string> = {
  [MeasureFilterInvalidReason.NotComparable]: "Only money measures can be compared.",
  [MeasureFilterInvalidReason.UnknownMeasure]: "A measure in this comparison is no longer available.",
  [MeasureFilterInvalidReason.SelfComparison]: "A measure cannot be compared with itself.",
  [MeasureFilterInvalidReason.Duplicate]: "This measure comparison is duplicated.",
  [MeasureFilterInvalidReason.MalformedValue]: "Comparison values must have no more than two decimal places.",
};

export class MeasureFilterInvalidException extends BadRequestException {
  constructor(readonly reason: MeasureFilterInvalidReason) {
    super(MEASURE_FILTER_INVALID_MESSAGES[reason]);
    this.name = "MeasureFilterInvalidException";
  }
}
