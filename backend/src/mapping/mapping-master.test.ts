import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPlant } from "../ingest/plant-mapping";
import {
  MAPPING_MASTER,
  MappingMasterValidationError,
  UNMAPPED_GL_LINE,
  canonicalPlantFromMaster,
  loadMappingMaster,
  resolveMappingTriple,
} from "./mapping-master";
import { MIS_MAPPING_MASTER } from "./mis-mapping-master";

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
  assert.equal(loadMappingMaster(MIS_MAPPING_MASTER).version, 2);
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
            plant_aliases: { sap: ["OTHER-SAP"], display: ["Other display"] },
            entries: [
              {
                ...selection.entries[0],
                target: { kind: "leaf", leaf_key: "different-leaf" },
              },
            ],
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
