import type { AskPlantChoice, AskPlantRefusal, AskPlantRefusalReason, AskRequest, SelectionFilter } from "@3f/contract";
import { MAPPING_MASTER, type MappingMaster, type MappingSelection, selectionAliases } from "../mapping/mapping-master";

export const PLANT_DIMENSION_ID = "plant";

export function comparePlantCodes(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface PlantOption {
  value: string;
  label: string;
}

export type PlantFilterValidation = { ok: true; filter: SelectionFilter } | { ok: false; refusal: AskPlantRefusal };

export const PLANT_REFUSAL_MESSAGES: Readonly<Record<AskPlantRefusalReason, (plants: readonly string[]) => string>> = {
  "plant-not-granted": (plants) => `You do not have access to ${plants.join(", ")}.`,
  "plants-revoked": (plants) =>
    `This view includes plants you no longer have access to: ${plants.join(", ")}. Edit its plants to run it.`,
  "choice-plants-revoked": (plants) => `You no longer have access to ${plants.join(", ")}. Ask again.`,
  "plant-filter-invalid": () => "This question's plant choice is not valid. Choose the plants again.",
  "no-plants-granted": () => "You do not have access to any plant.",
};

export function matchQuestionPlants(question: string): PlantOption[] {
  return MAPPING_MASTER.selections
    .filter((selection) => selectionMatchesQuestion(question, selection))
    .map(toPlantOption)
    .sort((left, right) => comparePlantCodes(left.value, right.value));
}

export function validatePlantFilter({
  filters,
  grantedPlants,
  origin,
}: {
  filters: readonly SelectionFilter[];
  grantedPlants: readonly string[];
  origin?: AskRequest["origin"];
}): PlantFilterValidation {
  if (grantedPlants.length === 0) return refusal("no-plants-granted");

  const plantFilters = filters.filter(({ dimensionId }) => dimensionId === PLANT_DIMENSION_ID);
  if (plantFilters.length !== 1) return refusal("plant-filter-invalid");

  const [plantFilter] = plantFilters;
  if (plantFilter.op !== "in" || !Array.isArray(plantFilter.value) || plantFilter.value.length === 0) {
    return refusal("plant-filter-invalid");
  }

  const canonicalPlants = new Set(MAPPING_MASTER.selections.map(({ plant_canonical }) => plant_canonical));
  if (plantFilter.value.some((plant) => !canonicalPlants.has(plant))) return refusal("plant-filter-invalid");

  const plants = [...new Set(plantFilter.value)].sort(comparePlantCodes);
  const grants = new Set(grantedPlants);
  const revoked = plants.filter((plant) => !grants.has(plant));
  if (revoked.length > 0) {
    const reason = revokedReason(origin);
    return refusal(reason, displayNames(revoked, MAPPING_MASTER));
  }

  return { ok: true, filter: { dimensionId: PLANT_DIMENSION_ID, op: "in", value: plants } };
}

export function plantChoiceOptions(grantedPlants: readonly string[]): Pick<AskPlantChoice, "options" | "allPlants"> {
  const grants = new Set(grantedPlants);
  const options = MAPPING_MASTER.selections
    .filter(({ plant_canonical }) => grants.has(plant_canonical))
    .map(toPlantOption)
    .sort((left, right) => comparePlantCodes(left.value, right.value));
  return {
    options,
    allPlants: { label: "All plants", value: options.map(({ value }) => value).sort(comparePlantCodes) },
  };
}

function selectionMatchesQuestion(question: string, selection: MappingSelection): boolean {
  const codeAliases = new Set([selection.plant_canonical, ...selection.plant_aliases.sap]);
  return selectionAliases(selection).some((alias) => {
    const caseSensitive = codeAliases.has(alias) && alias.length < 3;
    return wholeAliasPattern(alias, caseSensitive).test(question);
  });
}

function wholeAliasPattern(alias: string, caseSensitive: boolean): RegExp {
  const pattern = alias
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, caseSensitive ? "u" : "iu");
}

function toPlantOption(selection: MappingSelection): PlantOption {
  return { value: selection.plant_canonical, label: selection.plant_aliases.display[0] };
}

function displayNames(plants: readonly string[], master: MappingMaster): string[] {
  const requested = new Set(plants);
  return master.selections
    .filter(({ plant_canonical }) => requested.has(plant_canonical))
    .map(toPlantOption)
    .sort((left, right) => comparePlantCodes(left.value, right.value))
    .map(({ label }) => label);
}

function revokedReason(origin: AskRequest["origin"]): AskPlantRefusalReason {
  if (origin === "saved-view" || origin === "pin") return "plants-revoked";
  if (origin === "plant-choice" || origin === "period-choice") return "choice-plants-revoked";
  return "plant-not-granted";
}

function refusal(reason: AskPlantRefusalReason, plants: string[] = []): PlantFilterValidation {
  return { ok: false, refusal: { reason, plants } };
}
