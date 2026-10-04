import { BadRequestException } from "@nestjs/common";
import type { PlantFilterInvalidReason } from "@3f/contract";

export const PLANT_FILTER_INVALID_MESSAGES: Record<PlantFilterInvalidReason, (plants: string[]) => string> = {
  "plant-filter-invalid": () => "This question's plant choice is not valid. Choose the plants again.",
  "plant-not-granted": (plants) => `You do not have access to ${plants.join(", ")}.`,
};

export class PlantFilterInvalidException extends BadRequestException {
  constructor(reason: "plant-filter-invalid");
  constructor(reason: "plant-not-granted", plants: string[]);
  constructor(
    readonly reason: PlantFilterInvalidReason,
    readonly plants: string[] = [],
  ) {
    super(PLANT_FILTER_INVALID_MESSAGES[reason](plants));
    this.name = "PlantFilterInvalidException";
  }
}
