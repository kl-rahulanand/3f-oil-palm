export interface PlantClassification {
  readonly sap: string;
  readonly canonical: string;
  readonly display: string;
  readonly department: string;
  readonly function: string;
}

const NURSERY_PLANTS = new Set([
  "CHIR",
  "CK",
  "DMHS",
  "DUB-NUR",
  "GLIM",
  "Krishna",
  "LKMP",
  "NLR",
  "Nandyal",
  "Pend",
  "ROING",
  "S.Kota",
  "TMK-NK",
  "TPTY",
]);

export const PLANT_CLASSIFICATIONS: readonly PlantClassification[] = [
  "DUB-NUR",
  "AP-AGRI",
  "AY-CF",
  "AY-MC",
  "AY-PP",
  "AY-RF",
  "AY-SE",
  "AYM-01",
  "C G",
  "CHIR",
  "CK",
  "DMHS",
  "GLIM",
  "H.O",
  "KA-RAM",
  "Krishna",
  "LKMP",
  "NK",
  "NLR",
  "Nandyal",
  "Pend",
  "ROING",
  "S.Kota",
  "SK",
  "TMK-NK",
  "TPTY",
  "VJM",
  "YG-01",
  "YG-02",
  "YG-MC",
  "YG-PP",
].map((sap) => {
  const canonical = sap === "DUB-NUR" ? "DUB" : sap;
  const [department, plantFunction] =
    sap === "H.O"
      ? ["Corporate", "Office"]
      : NURSERY_PLANTS.has(sap)
        ? ["Agriculture", "Nursery"]
        : ["Operations", "Unit"];
  return {
    sap,
    canonical,
    display: sap === "DUB-NUR" ? "Agri - Nursery - DUB" : `${department} - ${plantFunction} - ${canonical}`,
    department,
    function: plantFunction,
  };
});
