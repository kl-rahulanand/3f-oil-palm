import assert from "node:assert/strict";
import test from "node:test";
import type { SelectionFilter } from "@3f/contract";
import {
  PLANT_DIMENSION_ID,
  PLANT_REFUSAL_MESSAGES,
  matchQuestionPlants,
  plantChoiceOptions,
  questionPlantSet,
  validatePlantFilter,
} from "./plant-set";

test("plant names in a question resolve by canonical SAP and display aliases without matching ordinary words", () => {
  assert.equal(PLANT_DIMENSION_ID, "plant");
  assert.deepEqual(matchQuestionPlants("Actual for dub, DUB-NUR and  Agri   -   Nursery   -   DUB "), [
    { value: "DUB", label: "Agri - Nursery - DUB" },
  ]);
  for (const alias of ["dub-nur", "Dub-Nur", "agri - nursery - dub", "AgRi   -  NuRsErY -   DuB"]) {
    assert.deepEqual(matchQuestionPlants(`Actual for ${alias}`), [{ value: "DUB", label: "Agri - Nursery - DUB" }]);
  }
  assert.deepEqual(matchQuestionPlants("Actual for chir and Operations   - Unit - VJM"), [
    { value: "CHIR", label: "Agriculture - Nursery - CHIR" },
    { value: "VJM", label: "Operations - Unit - VJM" },
  ]);
  assert.deepEqual(matchQuestionPlants("Actual for CK"), [{ value: "CK", label: "Agriculture - Nursery - CK" }]);
  for (const question of ["check July Actual Budget GL statement", "actual for ck", "TASKS"]) {
    assert.deepEqual(matchQuestionPlants(question), [], question);
  }
});

test("a plant named after a negating word is left out of the question's plant set", () => {
  const granted = ["CHIR", "DUB", "H.O", "VJM"];
  for (const word of [
    "except",
    "except for",
    "excluding",
    "exclude",
    "other than",
    "but not",
    "apart from",
    "without",
    "not",
  ]) {
    assert.deepEqual(questionPlantSet(`Actual for July 2026 ${word} DUB`, granted), ["CHIR", "H.O", "VJM"], word);
    assert.deepEqual(questionPlantSet(`Actual for CHIR and VJM ${word} DUB`, granted), ["CHIR", "VJM"], word);
  }

  assert.deepEqual(questionPlantSet("Actual by plant for July 2026 except DUB", granted), ["CHIR", "H.O", "VJM"]);
  assert.deepEqual(questionPlantSet("Actual by GL code for July 2026 for all plants other than H.O", granted), [
    "CHIR",
    "DUB",
    "VJM",
  ]);
  assert.deepEqual(questionPlantSet("Actual by GL code for July 2026 for DUB excluding CHIR", granted), ["DUB"]);
  assert.deepEqual(questionPlantSet("Actual except DUB and CHIR", granted), ["H.O", "VJM"]);
  assert.deepEqual(questionPlantSet("Actual except the DUB, CHIR or Operations - Unit - VJM plants", granted), ["H.O"]);
  assert.deepEqual(questionPlantSet("Actual for DUB, not CHIR, and VJM", granted), ["DUB"]);
  assert.deepEqual(questionPlantSet("Actual excluding Agri - Nursery - DUB", granted), ["CHIR", "H.O", "VJM"]);

  assert.deepEqual(questionPlantSet("Actual for DUB and CHIR", granted), ["CHIR", "DUB"]);
  assert.deepEqual(questionPlantSet("Which codes are not over budget for DUB", granted), ["DUB"]);
  assert.deepEqual(questionPlantSet("Actual for another DUB view", granted), ["DUB"]);
  assert.equal(questionPlantSet("Actual for July 2026 except budget", granted), undefined);
  assert.deepEqual(questionPlantSet("Actual except DUB", ["DUB"]), []);
  assert.deepEqual(questionPlantSet("Actual for DUB except DUB", granted), []);
});

test("the plant filter is exactly one canonical in-filter and valid values are sorted and deduplicated", () => {
  assert.deepEqual(
    validatePlantFilter({
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR", "DUB"] }],
      grantedPlants: ["DUB", "CHIR"],
    }),
    {
      ok: true,
      filter: { dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] },
    },
  );

  const invalidFilters: SelectionFilter[][] = [
    [],
    [{ dimensionId: "plant", op: "in", value: [] }],
    [{ dimensionId: "plant", op: "eq", value: "DUB" }],
    [{ dimensionId: "plant", op: "neq", value: "DUB" }],
    [{ dimensionId: "plant", op: "in", value: "DUB" }],
    [{ dimensionId: "plant", op: "in", value: ["UNKNOWN"] }],
    [{ dimensionId: "plant", op: "in", value: ["dub"] }],
    [{ dimensionId: "plant", op: "in", value: ["DUB-NUR"] }],
    [{ dimensionId: "plant", op: "in", value: ["Agri - Nursery - DUB"] }],
    [
      { dimensionId: "plant", op: "in", value: ["DUB"] },
      { dimensionId: "plant", op: "in", value: ["CHIR"] },
    ],
  ];
  for (const filters of invalidFilters) {
    assert.deepEqual(validatePlantFilter({ filters, grantedPlants: ["DUB", "CHIR"] }), {
      ok: false,
      refusal: { reason: "plant-filter-invalid", plants: [] },
    });
  }
});

test("plant filter refusals use no-grant invalid and origin-specific revoked order without intersecting", () => {
  assert.deepEqual(
    validatePlantFilter({
      filters: [{ dimensionId: "plant", op: "eq", value: "CHIR" }],
      grantedPlants: [],
      origin: "saved-view",
    }),
    { ok: false, refusal: { reason: "no-plants-granted", plants: [] } },
  );

  for (const origin of ["saved-view", "pin", "plant-choice", undefined] as const) {
    assert.deepEqual(
      validatePlantFilter({
        filters: [{ dimensionId: "plant", op: "eq", value: "CHIR" }],
        grantedPlants: ["DUB"],
        origin,
      }),
      { ok: false, refusal: { reason: "plant-filter-invalid", plants: [] } },
    );
  }

  assert.deepEqual(
    validatePlantFilter({
      filters: [{ dimensionId: "plant", op: "in", value: [] }],
      grantedPlants: ["DUB"],
      origin: "pin",
    }),
    { ok: false, refusal: { reason: "plant-filter-invalid", plants: [] } },
  );

  for (const [origin, reason] of [
    ["saved-view", "plants-revoked"],
    ["pin", "plants-revoked"],
    ["plant-choice", "choice-plants-revoked"],
    ["period-choice", "choice-plants-revoked"],
    [undefined, "plant-not-granted"],
  ] as const) {
    assert.deepEqual(
      validatePlantFilter({
        filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR"] }],
        grantedPlants: ["DUB"],
        origin,
      }),
      {
        ok: false,
        refusal: { reason, plants: ["Agriculture - Nursery - CHIR"] },
      },
    );
  }
});

test("picker choices come from the mapping master and refusal messages use the specified copy", () => {
  assert.deepEqual(plantChoiceOptions(["VJM", "UNKNOWN", "DUB"]), {
    options: [
      { value: "DUB", label: "Agri - Nursery - DUB" },
      { value: "VJM", label: "Operations - Unit - VJM" },
    ],
    allPlants: { label: "All plants", value: ["DUB", "VJM"] },
  });
  assert.equal(PLANT_REFUSAL_MESSAGES["plant-not-granted"](["Plant A"]), "You do not have access to Plant A.");
  assert.equal(
    PLANT_REFUSAL_MESSAGES["plants-revoked"](["Plant A", "Plant B"]),
    "This view includes plants you no longer have access to: Plant A, Plant B. Edit its plants to run it.",
  );
  assert.equal(
    PLANT_REFUSAL_MESSAGES["choice-plants-revoked"](["Plant A"]),
    "You no longer have access to Plant A. Ask again.",
  );
  assert.equal(
    PLANT_REFUSAL_MESSAGES["plant-filter-invalid"]([]),
    "This question's plant choice is not valid. Choose the plants again.",
  );
  assert.equal(PLANT_REFUSAL_MESSAGES["no-plants-granted"]([]), "You do not have access to any plant.");
});

test("picker options all-plants values and validated filters share canonical code-unit order", () => {
  assert.deepEqual(plantChoiceOptions(["Nandyal", "NLR"]), {
    options: [
      { value: "NLR", label: "Agriculture - Nursery - NLR" },
      { value: "Nandyal", label: "Agriculture - Nursery - Nandyal" },
    ],
    allPlants: { label: "All plants", value: ["NLR", "Nandyal"] },
  });
  assert.deepEqual(
    validatePlantFilter({
      filters: [{ dimensionId: "plant", op: "in", value: ["Nandyal", "NLR"] }],
      grantedPlants: ["Nandyal", "NLR"],
    }),
    {
      ok: true,
      filter: { dimensionId: "plant", op: "in", value: ["NLR", "Nandyal"] },
    },
  );
});
