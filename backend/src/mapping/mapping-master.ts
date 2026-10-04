import { z } from "zod";
import { MIS_MAPPING_MASTER } from "./mis-mapping-master";

export const UNMAPPED_GL_LINE = "unmapped-GL";

export interface MappingMasterDefinition {
  readonly version: number;
  readonly source: string;
  readonly formats: Readonly<Record<string, { readonly budget_owner_plant: string }>>;
  readonly selections: readonly MappingSelectionDefinition[];
}

export interface MappingSelectionDefinition {
  readonly department: string;
  readonly function: string;
  readonly plant_canonical: string;
  readonly plant_aliases: {
    readonly sap: readonly string[];
    readonly display: readonly string[];
  };
  readonly mis_format: string;
  readonly provisional_labels: boolean;
  readonly budget_gl_codes: readonly string[];
  readonly entries: readonly MappingEntryDefinition[];
}

export interface MappingEntryDefinition {
  readonly cost_center: string;
  readonly gl_code: string;
  readonly mis_line: string;
  readonly target: MappingTargetDefinition;
  readonly provisional: boolean;
  readonly reason?: string;
}

export type MappingTargetDefinition =
  { readonly kind: "leaf"; readonly leaf_key: string } | { readonly kind: "bucket" };

const nonEmpty = z.string().trim().min(1);
const entrySchema = z
  .object({
    cost_center: nonEmpty,
    gl_code: nonEmpty,
    mis_line: nonEmpty,
    target: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("leaf"), leaf_key: nonEmpty }).strict(),
        z.object({ kind: z.literal("bucket") }).strict(),
      ])
      .optional(),
    provisional: z.boolean(),
    reason: nonEmpty.optional(),
  })
  .strict();
const selectionSchema = z
  .object({
    department: nonEmpty,
    function: nonEmpty,
    plant_canonical: nonEmpty,
    plant_aliases: z.object({ sap: z.array(nonEmpty).min(1), display: z.array(nonEmpty).min(1) }).strict(),
    mis_format: nonEmpty,
    provisional_labels: z.boolean(),
    budget_gl_codes: z.array(nonEmpty).min(1),
    entries: z.array(entrySchema).min(1),
  })
  .strict();
const masterSchema = z
  .object({
    version: z.number().int().positive(),
    source: nonEmpty,
    formats: z.record(nonEmpty, z.object({ budget_owner_plant: nonEmpty }).strict()),
    selections: z.array(selectionSchema).min(1),
  })
  .strict();

export type MappingMaster = z.infer<typeof masterSchema>;
export type MappingSelection = MappingMaster["selections"][number];
export type MappingEntry = MappingSelection["entries"][number];

export interface MappingTriple {
  plant: string;
  cost_center: string;
  gl_code: string;
}

export interface MappingResolution extends MappingEntry {
  department: string;
  function: string;
  plant_canonical: string;
  mis_format: string;
}

export class MappingMasterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingMasterValidationError";
  }
}

export function loadMappingMaster(value: unknown): MappingMaster {
  const parsed = masterSchema.safeParse(value);
  if (!parsed.success) throw new MappingMasterValidationError("Mapping master is malformed");

  const selectionKeys = new Set<string>();
  const aliases = new Map<string, string>();
  const entryKeys = new Set<string>();
  for (const selection of parsed.data.selections) {
    const selectionKey = key(selection.department, selection.function, selection.plant_canonical);
    if (selectionKeys.has(selectionKey))
      throw new MappingMasterValidationError("Mapping master has a duplicate selection key");
    selectionKeys.add(selectionKey);

    for (const entry of selection.entries) {
      if (!entry.target) throw new MappingMasterValidationError("Mapping master has an entry without a target");
      const entryKey = key(selection.plant_canonical, entry.cost_center, entry.gl_code);
      if (entryKeys.has(entryKey))
        throw new MappingMasterValidationError("Mapping master has a duplicate selection entry");
      entryKeys.add(entryKey);
      if (entry.provisional && !entry.reason) {
        throw new MappingMasterValidationError("Mapping master has a provisional entry without a reason");
      }
    }

    for (const alias of selectionAliases(selection)) {
      const normalisedAlias = normalizePlantAlias(alias);
      const claimedBy = aliases.get(normalisedAlias);
      if (claimedBy && claimedBy !== selectionKey)
        throw new MappingMasterValidationError("Mapping master reuses a plant alias across selections");
      aliases.set(normalisedAlias, selectionKey);
    }
  }

  for (const [formatId, format] of Object.entries(parsed.data.formats)) {
    if (
      !parsed.data.selections.some(
        ({ plant_canonical, mis_format }) => plant_canonical === format.budget_owner_plant && mis_format === formatId,
      )
    ) {
      throw new MappingMasterValidationError("Mapping master format budget owner is not a canonical selection");
    }
  }
  if (parsed.data.selections.some(({ mis_format }) => !parsed.data.formats[mis_format])) {
    throw new MappingMasterValidationError("Mapping master selection format has no budget owner");
  }

  return parsed.data;
}

export function canonicalPlantFromMaster(plant: string, master: MappingMaster = MAPPING_MASTER): string | undefined {
  return master.selections.find((selection) => selectionAliases(selection).includes(plant))?.plant_canonical;
}

export function resolveMappingTriple(
  triple: MappingTriple,
  master: MappingMaster = MAPPING_MASTER,
): MappingResolution | undefined {
  const selection = master.selections.find((candidate) => selectionAliases(candidate).includes(triple.plant));
  const entry = selection?.entries.find(
    (candidate) => candidate.cost_center === triple.cost_center && candidate.gl_code === triple.gl_code,
  );
  if (!selection || !entry) return undefined;
  return {
    department: selection.department,
    function: selection.function,
    plant_canonical: selection.plant_canonical,
    mis_format: selection.mis_format,
    ...entry,
  };
}

export function budgetLeafKeysForFormat(formatId: string, master: MappingMaster = MAPPING_MASTER): string[] {
  return [
    ...new Set(
      master.selections
        .filter(({ mis_format }) => mis_format === formatId)
        .flatMap(({ entries }) => entries.flatMap(({ target }) => (target?.kind === "leaf" ? [target.leaf_key] : []))),
    ),
  ].sort();
}

export function selectionAliases(selection: MappingSelection): string[] {
  return [selection.plant_canonical, ...selection.plant_aliases.sap, ...selection.plant_aliases.display];
}

function normalizePlantAlias(alias: string): string {
  return alias.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function key(...parts: string[]): string {
  return parts.join("\u0000");
}

export const MAPPING_MASTER = loadMappingMaster(MIS_MAPPING_MASTER);
