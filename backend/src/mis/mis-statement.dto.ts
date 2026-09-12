import { ApiProperty } from "@nestjs/swagger";
import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementProvenance,
  MisStatementRefreshRequiredResponse,
  MisStatementResolvedResponse,
  MisStatementRunRequest,
  MisStatementUnresolvableResponse,
  ProvenanceBatch,
  SourcePresence,
} from "@3f/contract";
import { z } from "zod";
import { MisSelectionRunRequestDto, misSelectionRunRequestSchema } from "./mis-selection.dto";

const provenanceBatchSchema = z
  .object({
    source: z.enum(["actuals", "budget"]),
    period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    batchId: z.string().uuid(),
  })
  .strict();

export const misStatementRunRequestSchema = misSelectionRunRequestSchema.extend({
  pinnedBatches: z
    .array(provenanceBatchSchema)
    .min(1)
    .refine((values) => new Set(values.map(({ batchId }) => batchId)).size === values.length, {
      message: "pinned batches must be unique",
    })
    .optional(),
});

export class MisStatementRunRequestDto extends MisSelectionRunRequestDto implements MisStatementRunRequest {
  @ApiProperty({ type: () => [MisStatementProvenanceBatchDto], required: false })
  pinnedBatches?: ProvenanceBatch[];
}

class MisStatementMeasureBlockDto implements MisStatementMeasureBlock {
  @ApiProperty({ enum: ["selected", "fy26-27-ytd"] })
  key!: "selected" | "fy26-27-ytd";

  @ApiProperty({ example: "Jul 2026" })
  label!: string;

  @ApiProperty({ example: "2026-07-01" })
  from!: string;

  @ApiProperty({ example: "2026-07-01" })
  to!: string;

  @ApiProperty({ example: "10050136.29" })
  budget!: FixedScaleMoney;

  @ApiProperty({ type: String, example: null, nullable: true })
  rollover: null = null;

  @ApiProperty({ example: "11512712.07" })
  actual!: FixedScaleMoney;

  @ApiProperty({ type: String, example: "1.1455", nullable: true })
  percentage!: string | null;

  @ApiProperty({ enum: ["matched", "budget-only", "actual-only"], isArray: true })
  sourcePresence!: SourcePresence[];
}

class MisStatementNodeDto implements MisStatementNode {
  @ApiProperty({ example: "9|admin-expenses" })
  nodeKey!: string;

  @ApiProperty({ type: String, example: "9", nullable: true })
  sNo!: string | null;

  @ApiProperty({ example: "Admin Expenses" })
  budgetComponent!: string;

  @ApiProperty({ type: String, example: "55011101", nullable: true })
  glCode!: string | null;

  @ApiProperty({ type: [MisStatementMeasureBlockDto] })
  measures!: MisStatementMeasureBlockDto[];

  @ApiProperty({ type: () => [MisStatementNodeDto] })
  children!: MisStatementNodeDto[];
}

class MisStatementProvenanceBatchDto implements ProvenanceBatch {
  @ApiProperty({ enum: ["actuals", "budget"] })
  source!: "actuals" | "budget";

  @ApiProperty({ example: "2026-07-01" })
  period!: string;

  @ApiProperty({ format: "uuid" })
  batchId!: string;
}

export class MisStatementRefreshRequiredResponseDto implements MisStatementRefreshRequiredResponse {
  @ApiProperty({ enum: ["refresh-required"] })
  outcome: "refresh-required" = "refresh-required";

  @ApiProperty({ enum: ["The data was refreshed - ask again"] })
  notice: "The data was refreshed - ask again" = "The data was refreshed - ask again";
}

class MisStatementProvenanceDto implements MisStatementProvenance {
  @ApiProperty({ type: [MisStatementProvenanceBatchDto] })
  activeBatchIds!: MisStatementProvenanceBatchDto[];
}

class MisStatementScopeReadoutDto {
  @ApiProperty({ example: "Agriculture" })
  department!: string;

  @ApiProperty({ example: "Nursery" })
  function!: string;

  @ApiProperty({ example: "DUB" })
  plant!: string;

  @ApiProperty({ example: "2026-07-01" })
  period!: string;

  @ApiProperty({ example: ["Admin", "Primary"] })
  costCentres!: string[];

  @ApiProperty({ example: ["50001201", "50001701"] })
  glCodes!: string[];

  @ApiProperty({ example: "nursery-mis-financial-v1" })
  misFormat!: string;
}

export class MisStatementResolvedResponseDto implements MisStatementResolvedResponse {
  @ApiProperty({ enum: ["resolved"] })
  outcome: "resolved" = "resolved";

  @ApiProperty({ type: MisStatementScopeReadoutDto })
  scope!: MisStatementScopeReadoutDto;

  @ApiProperty({ type: [MisStatementNodeDto] })
  tree!: MisStatementNodeDto[];

  @ApiProperty({ type: MisStatementNodeDto })
  grandTotal!: MisStatementNodeDto;

  @ApiProperty({ type: MisStatementProvenanceDto })
  provenance!: MisStatementProvenanceDto;
}

export class MisStatementUnresolvableResponseDto implements MisStatementUnresolvableResponse {
  @ApiProperty({ enum: ["unresolvable"] })
  outcome: "unresolvable" = "unresolvable";

  @ApiProperty({ enum: ["No mapping configured"] })
  notice: "No mapping configured" = "No mapping configured";

  @ApiProperty({ type: [MisStatementNodeDto], maxItems: 0 })
  tree: [] = [];

  @ApiProperty({ type: MisStatementNodeDto, example: null, nullable: true })
  grandTotal: null = null;

  @ApiProperty({ type: MisStatementProvenanceDto })
  provenance!: MisStatementProvenanceDto;
}
