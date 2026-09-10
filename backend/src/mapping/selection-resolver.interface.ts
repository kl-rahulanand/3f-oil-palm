import type { MisSelectionOptionsResponse, MisSelectionRunRequest } from "@3f/contract";
import type { MappingEntry } from "./mapping-master";

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
  costCentres: string[];
  glCodes: string[];
  misFormat: string;
  bucketRows: MappingEntry[];
  triples: Array<{ plant: string; costCenter: string; glCode: string }>;
  masterGlCodes: string[];
  period: ResolvedSelectionPeriod;
}

export interface MasterUnresolvableSelection {
  outcome: "unresolvable";
}

export type MasterSelectionResolution = MasterResolvedSelection | MasterUnresolvableSelection;

export interface ISelectionResolverService {
  options(): Promise<MisSelectionOptionsResponse>;
  resolve(request: MisSelectionRunRequest): Promise<MasterSelectionResolution>;
}
