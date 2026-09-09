export const PLANT_NORMALIZATION: Readonly<Record<string, string>> = {
  "DUB-NUR": "DUB",
};

export function canonicalPlant(plant: string): string {
  return PLANT_NORMALIZATION[plant] ?? plant;
}
