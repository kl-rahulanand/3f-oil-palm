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

/**
 * The plants a question chooses: the plants it names, less any named after a negating word ("except DUB",
 * "other than H.O"). When it names plants only to leave them out, the reader's other granted plants are
 * chosen. Undefined when the question names no plant; empty when nothing is left to answer for.
 */
export function questionPlantSet(question: string, grantedPlants: readonly string[]): string[] | undefined {
  const mentions = plantMentions(question);
  if (mentions.length === 0) return undefined;

  const included = new Set<string>();
  const excluded = new Set<string>();
  let previous: { end: number; excluded: boolean } | undefined;
  for (const mention of mentions) {
    const before = question.slice(previous?.end ?? 0, mention.start);
    const isExcluded =
      NEGATED_TAIL.test(before) || (previous !== undefined && previous.excluded && LIST_JOIN.test(before));
    (isExcluded ? excluded : included).add(mention.plant);
    previous = { end: mention.end, excluded: isExcluded };
  }

  const chosen = included.size > 0 ? [...included] : [...grantedPlants];
  return [...new Set(chosen.filter((plant) => !excluded.has(plant)))].sort(comparePlantCodes);
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

const NEGATED_TAIL =
  /(?<![\p{L}\p{N}])(?:except(?:\s+for)?|excluding|exclude|other\s+than|but\s+not|apart\s+from|without|not)(?:\s|,|the(?![\p{L}\p{N}])|plants?(?![\p{L}\p{N}]))*$/iu;
const LIST_JOIN = /^(?:\s|,|&|\/|(?:and|or|nor|the|plants?)(?![\p{L}\p{N}]))*$/iu;

interface PlantMention {
  plant: string;
  start: number;
  end: number;
}

function plantMentions(question: string): PlantMention[] {
  const mentions: PlantMention[] = [];
  for (const selection of MAPPING_MASTER.selections) {
    const codeAliases = new Set([selection.plant_canonical, ...selection.plant_aliases.sap]);
    for (const alias of selectionAliases(selection)) {
      const caseSensitive = codeAliases.has(alias) && alias.length < 3;
      for (const match of question.matchAll(wholeAliasPattern(alias, caseSensitive, "g"))) {
        mentions.push({ plant: selection.plant_canonical, start: match.index, end: match.index + match[0].length });
      }
    }
  }

  mentions.sort((left, right) => left.start - right.start || right.end - left.end);
  const outermost: PlantMention[] = [];
  for (const mention of mentions) {
    if (outermost.length > 0 && mention.start < outermost[outermost.length - 1].end) continue;
    outermost.push(mention);
  }
  return outermost;
}

function selectionMatchesQuestion(question: string, selection: MappingSelection): boolean {
  const codeAliases = new Set([selection.plant_canonical, ...selection.plant_aliases.sap]);
  return selectionAliases(selection).some((alias) => {
    const caseSensitive = codeAliases.has(alias) && alias.length < 3;
    return wholeAliasPattern(alias, caseSensitive).test(question);
  });
}

function wholeAliasPattern(alias: string, caseSensitive: boolean, flags = ""): RegExp {
  const pattern = alias
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, `${flags}${caseSensitive ? "u" : "iu"}`);
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
