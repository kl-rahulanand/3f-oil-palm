import type { MisSelectionOptionsResponse, MisSelectionRunRequest } from "@3f/contract";
import type { MappingEntry } from "./mapping-master";
import type { GovernedSelectionScope } from "../sql/sqlBuilder";

export interface ResolvedSelectionPeriod {
  value: string;
  from: string;
  to: string;
}

export interface MasterResolvedSelection {
  outcome: "resolved";
  department: string;
  function: string;
  plant: string;
  plantDisplay: string;
  provisional: boolean;
  budgetOwnerPlant: string;
  costCentres: string[];
  glCodes: string[];
  misFormat: string;
  bucketRows: MappingEntry[];
  triples: Array<{ plant: string; costCenter: string; glCode: string }>;
  leafTargets?: NonNullable<GovernedSelectionScope["leafTargets"]>;
  masterGlCodes: string[];
  period: ResolvedSelectionPeriod;
}

export interface MasterUnresolvableSelection {
  outcome: "unresolvable";
}

export type MasterSelectionResolution = MasterResolvedSelection | MasterUnresolvableSelection;

export interface ISelectionResolverService {
  options(allowedPlants?: string[]): Promise<MisSelectionOptionsResponse>;
  canonicalPlant(plant: string): string | undefined;
  resolve(request: MisSelectionRunRequest): Promise<MasterSelectionResolution>;
}
