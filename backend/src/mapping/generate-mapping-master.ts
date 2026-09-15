import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Workbook } from "exceljs";
import prettier from "prettier";
import { outlineSection, stableMisLeafKey } from "../ingest/mis-format-outline";
import type { MisBudgetOutlineInput } from "../warehouse/ingestion.repository";
import type { MappingMasterDefinition } from "./mapping-master";
import { PLANT_CLASSIFICATIONS } from "./plant-classification";

const SOURCE = "docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx";
const FORMAT = "docs/context/2026-08-20-srihari-phase1-data/Nursery MIS Format.xlsx";
const FORMAT_ID = "nursery-mis-financial-v1";
const SEEDED_REASON = "Seeded from Sheet1 pending reconciliation with the authoritative Mapping Master";
const ABSENT_GL_REASON = "GL absent from Sheet1";
const CONFLICT_REASON = "Sheet1 says Tertiary while SAP books Primary";
const DUB_ENTRY_ORDER = [
  "Admin|54023002",
  "Admin|55010302",
  "Admin|55010305",
  "Admin|55010401",
  "Admin|55010603",
  "Admin|55010701",
  "Admin|55010901",
  "Admin|55010902",
  "Admin|55011101",
  "Imported Sprouts|50001201",
  "Imported Sprouts|50001202",
  "Manpower|55021000",
  "Manpower|55023001",
  "Primary|50001603",
  "Primary|50001605",
  "Primary|50001606",
  "Primary|50001901",
  "Transportation Charges|50001981",
  "secondary|50001502",
  "Primary|50001701",
  "Primary|50001702",
  "Primary|50001703",
  "Primary|50001704",
  "Primary|50001705",
  "Primary|50001706",
  "Tertiary|50001905",
  "Primary|50001902",
  "Primary|50001903",
];

type EntryTuple = readonly [string, string, string, "leaf" | "bucket", string, string];

export class MappingMasterGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingMasterGenerationError";
  }
}

export async function generateMappingMaster(root = resolve(__dirname, "../../..")): Promise<MappingMasterDefinition> {
  const sourceWorkbook = await loadWorkbook(resolve(root, SOURCE));
  const formatWorkbook = await loadWorkbook(resolve(root, FORMAT));
  const source = sourceWorkbook.getWorksheet("Sheet1");
  const actuals = sourceWorkbook.getWorksheet("SAP Report");
  const format = formatWorkbook.getWorksheet("MIs Format");
  if (!source || !actuals || !format)
    throw new MappingMasterGenerationError("Mapping workbooks are missing a required sheet");

  const sheetPairs = new Map<string, { misLine: string; section: string }>();
  for (let rowNumber = 4; rowNumber <= source.rowCount; rowNumber += 1) {
    const row = source.getRow(rowNumber);
    const costCenter = row.getCell(5).text.trim();
    const glCode = row.getCell(3).text.trim();
    if (!costCenter || !glCode) continue;
    sheetPairs.set(pairKey(costCenter, glCode), {
      misLine: row.getCell(4).text.trim(),
      section: sectionFor(costCenter, glCode),
    });
  }

  const outline = formatOutline(format);
  const observed = new Map<string, Set<string>>();
  for (let rowNumber = 4; rowNumber <= actuals.rowCount; rowNumber += 1) {
    const row = actuals.getRow(rowNumber);
    const plant = row.getCell(6).text.trim();
    const costCenter = row.getCell(7).text.trim();
    const glCode = row.getCell(8).text.trim();
    if (!plant || !costCenter || !glCode) continue;
    const pairs = observed.get(plant) ?? new Set<string>();
    pairs.add(pairKey(costCenter, glCode));
    observed.set(plant, pairs);
  }

  const knownPlants = new Set(PLANT_CLASSIFICATIONS.map(({ sap }) => sap));
  const unknownPlants = [...observed.keys()].filter((plant) => !knownPlants.has(plant));
  if (unknownPlants.length)
    throw new MappingMasterGenerationError(`Plant classification is missing ${unknownPlants.join(", ")}`);

  return {
    version: 3,
    source: `${SOURCE}#Sheet1 + ${SOURCE}#SAP Report + plant-classification.ts`,
    formats: { [FORMAT_ID]: { budget_owner_plant: "DUB" } },
    selections: PLANT_CLASSIFICATIONS.map((plant) => {
      const pairs = [...(observed.get(plant.sap) ?? [])];
      pairs.sort(
        plant.canonical === "DUB"
          ? (left, right) =>
              DUB_ENTRY_ORDER.indexOf(left.replace("\0", "|")) - DUB_ENTRY_ORDER.indexOf(right.replace("\0", "|"))
          : undefined,
      );
      const entries = pairs.map((pair) => entryFor(pair, sheetPairs, outline));
      return {
        department: plant.department,
        function: plant.function,
        plant_canonical: plant.canonical,
        plant_aliases: { sap: [plant.sap], display: [plant.display] },
        mis_format: FORMAT_ID,
        provisional_labels: plant.canonical !== "DUB",
        budget_gl_codes: [...new Set(entries.filter((entry) => entry[3] === "leaf").map((entry) => entry[1]))].sort(),
        entries: entries.map(tupleToEntry),
      };
    }),
  };
}

function entryFor(
  pair: string,
  sheetPairs: Map<string, { misLine: string; section: string }>,
  outline: MisBudgetOutlineInput[],
): EntryTuple {
  const [costCenter, glCode] = pair.split("\0");
  const mapped = sheetPairs.get(pair);
  if (!mapped) {
    const reason =
      costCenter === "Primary" && ["50001902", "50001903"].includes(glCode) ? CONFLICT_REASON : ABSENT_GL_REASON;
    return [costCenter, glCode, "unmapped-GL", "bucket", "", reason];
  }
  const targets = outline.filter(
    (node) =>
      node.leafKey &&
      node.glCode === glCode &&
      outlineSection(node, outline) === mapped.section &&
      (mapped.section !== "7" || node.label.toLowerCase().includes(costCenter.toLowerCase())),
  );
  if (targets.length !== 1) {
    throw new MappingMasterGenerationError(`${costCenter}/${glCode} resolves to ${targets.length} outline leaves`);
  }
  return [costCenter, glCode, mapped.misLine, "leaf", targets[0].leafKey!, SEEDED_REASON];
}

function tupleToEntry([cost_center, gl_code, mis_line, kind, leaf_key, reason]: EntryTuple) {
  return {
    cost_center,
    gl_code,
    mis_line,
    target: kind === "leaf" ? ({ kind, leaf_key } as const) : ({ kind } as const),
    provisional: true,
    reason,
  };
}

function formatOutline(worksheet: NonNullable<ReturnType<Workbook["getWorksheet"]>>): MisBudgetOutlineInput[] {
  const outline: MisBudgetOutlineInput[] = [];
  const parents: Array<{ nodeKey: string; sNo?: string }> = [];
  for (let rowNumber = 481; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (/^Table-3/i.test(row.getCell(1).text.trim())) break;
    const labelCell = row.getCell(2);
    const label = labelCell.text.trim();
    const glCode = row.getCell(6).text.trim();
    const subtotal = /\$?[A-Z]{1,3}\$?\d+/i.test(row.getCell(24).formula ?? "");
    if (!label || (!glCode && !subtotal)) continue;
    const depth = labelCell.alignment?.indent ?? 0;
    const parent = depth ? parents[depth - 1] : undefined;
    const sNo = row.getCell(1).text.trim() || undefined;
    const identitySNo = sNo ?? parent?.sNo;
    const leafKey = subtotal ? undefined : stableMisLeafKey(identitySNo!, glCode, label);
    const nodeKey = leafKey ?? `node:${identitySNo}:${rowNumber}`;
    outline.push({
      nodeKey,
      parentKey: parent?.nodeKey,
      depth,
      sNo,
      label,
      sortOrder: outline.length,
      glCode,
      leafKey,
    });
    parents[depth] = { nodeKey, sNo: identitySNo };
    parents.length = depth + 1;
  }
  return outline;
}

function sectionFor(costCenter: string, glCode: string): string {
  if (costCenter === "Imported Sprouts") return "1";
  if (costCenter === "Indigenous Sprouts") return "2";
  if (glCode.startsWith("500015")) return "3";
  if (glCode.startsWith("500016")) return costCenter === "Primary" ? "4" : costCenter === "secondary" ? "5" : "6";
  if (glCode.startsWith("500019") && ["Primary", "secondary", "Tertiary"].includes(costCenter)) return "7";
  if (costCenter === "Manpower") return "8";
  if (costCenter === "Admin") return "9";
  if (costCenter === "Indigenous Sapling") return "10";
  if (costCenter === "Import Sapling") return "11";
  if (costCenter === "Transportation Charges") return "14";
  if (costCenter === "Capex") return "15";
  throw new MappingMasterGenerationError(`No statement section for ${costCenter}/${glCode}`);
}

async function loadWorkbook(path: string): Promise<Workbook> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load((await readFile(path)) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new MappingMasterGenerationError(`Cannot read mapping workbook ${path}`);
  }
  return workbook;
}

function pairKey(costCenter: string, glCode: string): string {
  return `${costCenter}\0${glCode}`;
}

function render(master: MappingMasterDefinition): string {
  const rows = master.selections.flatMap((selection) =>
    selection.entries.map((entry) => [
      selection.plant_aliases.sap[0],
      entry.cost_center,
      entry.gl_code,
      entry.mis_line,
      entry.target.kind,
      entry.target.kind === "leaf" ? entry.target.leaf_key : "",
    ]),
  );
  return `import type { MappingMasterDefinition } from "./mapping-master";
import { PLANT_CLASSIFICATIONS } from "./plant-classification";

type GeneratedEntry = readonly [string, string, string, string, "leaf" | "bucket", string];
const GENERATED_ENTRIES = [
${rows.map((row) => `  ${JSON.stringify(row.join("\0"))},`).join("\n")}
];

export const MIS_MAPPING_MASTER = {
  version: 3,
  source: ${JSON.stringify(master.source)},
  formats: { "${FORMAT_ID}": { budget_owner_plant: "DUB" } },
  selections: PLANT_CLASSIFICATIONS.map((plant) => {
    const entries = GENERATED_ENTRIES.map((row) => row.split("\\0") as unknown as GeneratedEntry)
      .filter(([sap]) => sap === plant.sap)
      .map(([, cost_center, gl_code, mis_line, kind, leaf_key]) => ({
        cost_center,
        gl_code,
        mis_line,
        target: kind === "leaf" ? { kind, leaf_key } : { kind },
        provisional: true,
        reason:
          kind === "leaf"
            ? "${SEEDED_REASON}"
            : cost_center === "Primary" && (gl_code === "50001902" || gl_code === "50001903")
              ? "${CONFLICT_REASON}"
              : "${ABSENT_GL_REASON}",
      }));
    return {
      department: plant.department,
      function: plant.function,
      plant_canonical: plant.canonical,
      plant_aliases: { sap: [plant.sap], display: [plant.display] },
      mis_format: "${FORMAT_ID}",
      provisional_labels: plant.canonical !== "DUB",
      budget_gl_codes: [...new Set(entries.filter(({ target }) => target.kind === "leaf").map(({ gl_code }) => gl_code))].sort(),
      entries,
    };
  }),
} satisfies MappingMasterDefinition;
`;
}

if (require.main === module) {
  const root = resolve(__dirname, "../../..");
  generateMappingMaster(root).then(async (master) =>
    writeFile(
      resolve(root, "backend/src/mapping/mis-mapping-master.ts"),
      await prettier.format(render(master), { parser: "typescript", printWidth: 120 }),
    ),
  );
}
