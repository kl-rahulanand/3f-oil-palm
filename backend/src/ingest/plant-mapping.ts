import { canonicalPlantFromMaster } from "../mapping/mapping-master";

export function canonicalPlant(plant: string): string {
  return canonicalPlantFromMaster(plant) ?? plant;
}
