import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { Workbook } from "exceljs";
import { canonicalPlant } from "../ingest/plant-mapping";
import { generateMappingMaster } from "./generate-mapping-master";
import {
  MAPPING_MASTER,
  MappingMasterValidationError,
  UNMAPPED_GL_LINE,
  canonicalPlantFromMaster,
  loadMappingMaster,
  resolveMappingTriple,
} from "./mapping-master";
import { MIS_MAPPING_MASTER } from "./mis-mapping-master";
import { PLANT_CLASSIFICATIONS } from "./plant-classification";

const DUB_TRIPLES = [
  triple("Admin", "54023002", "Computer Maintenance", 1),
  triple("Admin", "55010302", "Repair and Maintenance", 4),
  triple("Admin", "55010305", "Miscellaneous Expenses", 7),
  triple("Admin", "55010401", "Printing & Stationery", 2),
  triple("Admin", "55010603", "Land Lease Rent", 3),
  triple("Admin", "55010701", "Security Charges", 5),
  triple("Admin", "55010901", "Petrol and Diesel Charges", 4),
  triple("Admin", "55010902", "Repairs & Maintenance - Vehicles", 2),
  triple("Admin", "55011101", "Office Electricity Expenses", 1),
  triple("Imported Sprouts", "50001201", "Sprout Cost", 2),
  triple("Imported Sprouts", "50001202", "Clearing & Forwarding", 1),
  triple("Manpower", "55021000", "Salaries", 18),
  triple("Manpower", "55023001", "Staff Welfare", 2),
  triple("Primary", "50001603", "Protrays", 1),
  triple("Primary", "50001605", "Fertilizers & Manures", 3),
  triple("Primary", "50001606", "Pesticides / Fungicides", 1),
  triple("Primary", "50001901", "Nursery labour", 3),
  triple("Transportation Charges", "50001981", "Transportation Charges", 2),
  triple("secondary", "50001502", "Land Levelling", 4),
  triple("Primary", "50001701", UNMAPPED_GL_LINE, 1),
  triple("Primary", "50001702", UNMAPPED_GL_LINE, 1),
  triple("Primary", "50001703", UNMAPPED_GL_LINE, 1),
  triple("Primary", "50001704", UNMAPPED_GL_LINE, 2),
  triple("Primary", "50001705", UNMAPPED_GL_LINE, 1),
  triple("Primary", "50001706", UNMAPPED_GL_LINE, 2),
  triple("Tertiary", "50001905", UNMAPPED_GL_LINE, 3),
  triple("Primary", "50001902", UNMAPPED_GL_LINE, 8),
  triple("Primary", "50001903", UNMAPPED_GL_LINE, 3),
] as const;

test("the mapping master loader accepts the versioned master and rejects a malformed master a duplicate selection key and a provisional entry that carries no reason, and the master is the single authority for the canonical plant the SAP alias and the display alias", () => {
  assert.equal(loadMappingMaster(MIS_MAPPING_MASTER).version, 3);
  assert.throws(() => loadMappingMaster({ version: 1 }), MappingMasterValidationError);
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [...MIS_MAPPING_MASTER.selections, MIS_MAPPING_MASTER.selections[0]],
      }),
    /duplicate selection key/,
  );
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          {
            ...MIS_MAPPING_MASTER.selections[0],
            entries: [{ ...MIS_MAPPING_MASTER.selections[0].entries[0], reason: undefined }],
          },
        ],
      }),
    /provisional entry without a reason/,
  );
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          {
            ...MIS_MAPPING_MASTER.selections[0],
            entries: [{ ...MIS_MAPPING_MASTER.selections[0].entries[0], target: undefined }],
          },
        ],
      }),
    /entry without a target/,
  );

  for (const alias of ["DUB", "DUB-NUR", "Agri - Nursery - DUB"]) {
    assert.equal(canonicalPlantFromMaster(alias), "DUB");
    assert.equal(canonicalPlant(alias), "DUB");
  }
  assert.equal(canonicalPlant("UNKNOWN"), "UNKNOWN");
});

test("the mapping master rejects plant aliases that collide after case and repeated whitespace normalisation", () => {
  const first = MIS_MAPPING_MASTER.selections[0];
  const second = MIS_MAPPING_MASTER.selections[1];
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          first,
          {
            ...second,
            plant_aliases: { ...second.plant_aliases, display: ["  agri   - nursery - dub  "] },
          },
        ],
      }),
    /reuses a plant alias/,
  );
});

test("the mapping master resolves a SAP cost centre and GL triple to exactly one statement leaf and records the budget leaf correspondence as provisional with a reason", () => {
  const leaf = resolveMappingTriple({ plant: "DUB-NUR", cost_center: "Primary", gl_code: "50001605" });
  assert.deepEqual(leaf?.target, {
    kind: "leaf",
    leaf_key: "4.5|50001605|fertilizers-manures",
  });
  assert.equal(leaf?.provisional, true);
  assert.ok(leaf?.reason);

  const bucket = resolveMappingTriple({ plant: "DUB-NUR", cost_center: "Primary", gl_code: "50001701" });
  assert.deepEqual(bucket?.target, { kind: "bucket" });
  assert.equal(bucket?.provisional, true);
  assert.ok(bucket?.reason);

  const selection = MIS_MAPPING_MASTER.selections[0];
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          {
            ...selection,
            entries: [
              selection.entries[0],
              { ...selection.entries[0], target: { kind: "leaf", leaf_key: "different-leaf" } },
            ],
          },
        ],
      }),
    /duplicate selection entry/,
  );
});

test("the generated master equals the checked in master and names every SAP plant in the July extract with provisional labels and DUB as the budget owner", async () => {
  assert.deepEqual(await generateMappingMaster(), MIS_MAPPING_MASTER);
  assert.equal(MAPPING_MASTER.version, 3);
  assert.equal(MAPPING_MASTER.formats["nursery-mis-financial-v1"].budget_owner_plant, "DUB");
  assert.equal(MAPPING_MASTER.selections.length, 31);
  assert.ok(
    MAPPING_MASTER.selections.every(({ entries }) => entries.every(({ provisional, reason }) => provisional && reason)),
  );
  assert.ok(
    MAPPING_MASTER.selections
      .filter(({ plant_canonical }) => plant_canonical !== "DUB")
      .every(({ provisional_labels }) => provisional_labels),
  );
});

test("every plant cost centre and GL triple in the July extract resolves exactly once with the eleven unnamed pairs bucketed under the existing reason literals and the DUB selection unchanged", async () => {
  const rows = await actualRows();
  const unresolvedPairs = new Set<string>();
  for (const { plant, costCenter, glCode } of rows) {
    const resolution = resolveMappingTriple({ plant, cost_center: costCenter, gl_code: glCode });
    assert.ok(resolution, `${plant}/${costCenter}/${glCode}`);
    assert.ok(resolution.target);
    if (resolution.target.kind === "bucket") unresolvedPairs.add(`${costCenter}\0${glCode}`);
  }
  assert.equal(unresolvedPairs.size, 11);
  assert.deepEqual(
    new Set([...unresolvedPairs].map((pair) => pair.split("\0")[1])),
    new Set([
      "50001701",
      "50001702",
      "50001703",
      "50001704",
      "50001705",
      "50001706",
      "50001802",
      "50001902",
      "50001903",
      "50001904",
      "50001905",
    ]),
  );
  assert.equal(MAPPING_MASTER.selections.find(({ plant_canonical }) => plant_canonical === "DUB")?.entries.length, 28);
});

test("the thirty one plants resolved actual totals computed from the July extract through the master sum to the company net and HO resolves entirely to the manpower and admin sections", async () => {
  const totals = new Map<string, bigint>();
  for (const row of await actualRows()) {
    const resolution = resolveMappingTriple({ plant: row.plant, cost_center: row.costCenter, gl_code: row.glCode });
    assert.ok(resolution);
    assert.ok(resolution.target);
    const canonical = canonicalPlantFromMaster(row.plant)!;
    totals.set(canonical, (totals.get(canonical) ?? 0n) + row.paise);
    if (row.plant === "H.O" && resolution.target.kind === "leaf") assert.match(resolution.target.leaf_key, /^(8|9)/);
  }
  assert.equal(totals.size, 31);
  assert.equal(
    [...totals.values()].reduce((sum, value) => sum + value, 0n),
    11_027_371_800n,
  );
});

test("plant classification is a pure function of the committed table and the extract cost centres yielding fourteen nursery plants HO as corporate office and the rest as operations unit", async () => {
  const costCentres = new Map<string, Set<string>>();
  for (const { plant, costCenter } of await actualRows()) {
    const values = costCentres.get(plant) ?? new Set<string>();
    values.add(costCenter);
    costCentres.set(plant, values);
  }
  const nursery = PLANT_CLASSIFICATIONS.filter(
    ({ department, function: plantFunction }) => department === "Agriculture" && plantFunction === "Nursery",
  );
  assert.equal(nursery.length, 14);
  assert.ok(
    nursery.every(({ sap }) =>
      [...(costCentres.get(sap) ?? [])].some((value) => !["Admin", "Manpower"].includes(value)),
    ),
  );
  assert.deepEqual(
    PLANT_CLASSIFICATIONS.find(({ sap }) => sap === "H.O"),
    { sap: "H.O", canonical: "H.O", display: "Corporate - Office - H.O", department: "Corporate", function: "Office" },
  );
  assert.ok(
    PLANT_CLASSIFICATIONS.filter(({ sap }) => sap !== "H.O" && !nursery.some((plant) => plant.sap === sap)).every(
      ({ department, function: plantFunction }) => department === "Operations" && plantFunction === "Unit",
    ),
  );
});

test("the loader requires a budget owner that is a canonical selection of its format and re-keys the duplicate pair guard per plant while still rejecting one triple claiming two targets", () => {
  assert.throws(() => loadMappingMaster({ ...MIS_MAPPING_MASTER, formats: {} }), /no budget owner/);
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        formats: { "nursery-mis-financial-v1": { budget_owner_plant: "UNKNOWN" } },
      }),
    /not a canonical selection/,
  );
  const dub = MIS_MAPPING_MASTER.selections[0];
  const other = MIS_MAPPING_MASTER.selections[1];
  assert.doesNotThrow(() =>
    loadMappingMaster({
      ...MIS_MAPPING_MASTER,
      selections: [
        { ...dub, entries: [dub.entries[0]] },
        { ...other, entries: [{ ...dub.entries[0] }] },
      ],
    }),
  );
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          { ...dub, entries: [dub.entries[0]] },
          {
            ...dub,
            department: "Other",
            entries: [{ ...dub.entries[0], target: { kind: "leaf", leaf_key: "other" } }],
          },
        ],
      }),
    /duplicate selection entry/,
  );
});

test("the mapping master maps each of the nine unresolved DUB triples to the reserved unmapped GL line with a reason and its mapped plus bucketed triples are exactly the twenty eight distinct DUB triples so nothing is inferred and nothing is dropped", () => {
  const selection = MAPPING_MASTER.selections[0];
  assert.equal(selection.entries.length, 28);
  assert.equal(new Set(DUB_TRIPLES.map(({ cost_center, gl_code }) => `${cost_center}\u0000${gl_code}`)).size, 28);
  assert.equal(new Set(selection.entries.map(({ cost_center, gl_code }) => `${cost_center}\u0000${gl_code}`)).size, 28);
  assert.deepEqual(
    selection.entries.map(({ cost_center, gl_code }) => ({ cost_center, gl_code })),
    DUB_TRIPLES.map(({ cost_center, gl_code }) => ({ cost_center, gl_code })),
  );
  assert.deepEqual(
    selection.budget_gl_codes,
    [
      ...new Set(
        selection.entries.filter(({ mis_line }) => mis_line !== UNMAPPED_GL_LINE).map(({ gl_code }) => gl_code),
      ),
    ].sort(),
  );

  let mappedRows = 0;
  let bucketedRows = 0;
  let bucketedTriples = 0;
  for (const expected of DUB_TRIPLES) {
    const resolution = resolveMappingTriple({
      plant: "DUB-NUR",
      cost_center: expected.cost_center,
      gl_code: expected.gl_code,
    });
    assert.equal(resolution?.mis_line, expected.mis_line);
    assert.equal(resolution?.provisional, true);
    assert.ok(resolution?.reason);
    if (expected.mis_line === UNMAPPED_GL_LINE) {
      bucketedTriples += 1;
      bucketedRows += expected.rows;
    } else {
      mappedRows += expected.rows;
    }
  }

  assert.deepEqual(
    { mappedRows, bucketedRows, totalRows: mappedRows + bucketedRows },
    { mappedRows: 66, bucketedRows: 22, totalRows: 88 },
  );
  assert.equal(bucketedTriples, 9);
  assert.match(
    resolveMappingTriple({ plant: "DUB-NUR", cost_center: "Primary", gl_code: "50001902" })!.reason!,
    /Sheet1 says Tertiary while SAP books Primary/,
  );
  assert.equal(resolveMappingTriple({ plant: "DUB-NUR", cost_center: "Primary", gl_code: "unknown" }), undefined);
});

test("resolution is independent of the seed provenance so mutating the source workbook name on the master leaves every triple resolving to the same MIS line and the same bucket outcome, and the loader rejects a duplicate cost centre and GL entry within one selection and an alias reused across two selections", () => {
  const renamed = loadMappingMaster({ ...MIS_MAPPING_MASTER, source: "renamed-seed.xlsx#Sheet1" });
  for (const expected of DUB_TRIPLES) {
    const triple = { plant: "DUB-NUR", cost_center: expected.cost_center, gl_code: expected.gl_code };
    const outcome = (master = MAPPING_MASTER) => {
      const resolution = resolveMappingTriple(triple, master);
      return (
        resolution && { mis_line: resolution.mis_line, provisional: resolution.provisional, reason: resolution.reason }
      );
    };
    assert.deepEqual(outcome(renamed), outcome());
  }

  const selection = MIS_MAPPING_MASTER.selections[0];
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [{ ...selection, entries: [selection.entries[0], selection.entries[0]] }],
      }),
    /duplicate selection entry/,
  );
  assert.throws(
    () =>
      loadMappingMaster({
        ...MIS_MAPPING_MASTER,
        selections: [
          selection,
          {
            ...selection,
            department: "Other",
            plant_canonical: "OTHER",
            plant_aliases: { sap: ["DUB-NUR"], display: ["Other display"] },
          },
        ],
      }),
    /reuses a plant alias/,
  );
});

function triple(cost_center: string, gl_code: string, mis_line: string, rows: number) {
  return { cost_center, gl_code, mis_line, rows };
}

async function actualRows() {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(resolve("docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx"));
  const sheet = workbook.getWorksheet("SAP Report")!;
  return Array.from({ length: sheet.rowCount - 3 }, (_, index) => sheet.getRow(index + 4)).map((row) => ({
    plant: row.getCell(6).text.trim(),
    costCenter: row.getCell(7).text.trim(),
    glCode: row.getCell(8).text.trim(),
    paise: toPaise(Number(row.getCell(10).value ?? 0)) - toPaise(Number(row.getCell(11).value ?? 0)),
  }));
}

function toPaise(value: number): bigint {
  const scaled = Math.abs(value) * 100;
  const rounded = Math.round(scaled + Math.min(Number.EPSILON * scaled, 1e-7));
  return BigInt(value < 0 ? -rounded : rounded);
}
