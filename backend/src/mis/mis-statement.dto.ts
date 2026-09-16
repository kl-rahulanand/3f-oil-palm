import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import type {
  FixedScaleMoney,
  MisStatementLoadedMeasureBlock,
  MisStatementNotLoadedMeasureBlock,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementNodeMetadata,
  MisStatementRouteResponse,
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
    .refine((values) => new Set(values.map(({ batchId }) => batchId)).size === values.length, {
      message: "pinned batches must be unique",
    })
    .optional(),
});

const fixedScaleMoneySchema = z.custom<FixedScaleMoney>(
  (value) => typeof value === "string" && /^-?\d+\.\d{2}$/.test(value),
);
const measureBaseSchema = z.object({
  key: z.enum(["selected", "fy26-27-ytd"]),
  label: z.string(),
  from: z.string(),
  to: z.string(),
  rollover: z.null(),
  actual: fixedScaleMoneySchema,
  sourcePresence: z.array(z.enum(["matched", "budget-only", "actual-only"])),
});
const measureSchema: z.ZodType<MisStatementMeasureBlock> = z.discriminatedUnion("budgetState", [
  measureBaseSchema
    .extend({ budgetState: z.literal("loaded"), budget: fixedScaleMoneySchema, percentage: z.string().nullable() })
    .strict(),
  measureBaseSchema.extend({ budgetState: z.literal("not-loaded"), budget: z.null(), percentage: z.null() }).strict(),
]);
const statementNodeSchema: z.ZodType<MisStatementNode> = z.lazy(() =>
  z
    .object({
      nodeKey: z.string(),
      sNo: z.string().nullable(),
      budgetComponent: z.string(),
      glCode: z.string().nullable(),
      measures: z.array(measureSchema),
      children: z.array(statementNodeSchema),
    })
    .strict(),
);
const statementScopeSchema = z
  .object({
    department: z.string(),
    function: z.string(),
    plant: z.string(),
    plantDisplay: z.string(),
    provisional: z.boolean(),
    period: z.string(),
    costCentres: z.array(z.string()),
    glCodes: z.array(z.string()),
    misFormat: z.string(),
  })
  .strict();
const provenanceSchema = z.object({ activeBatchIds: z.array(provenanceBatchSchema) }).strict();
const nodeMetadataSchema: z.ZodType<MisStatementNodeMetadata> = z
  .object({ nodeKey: z.string(), glCodes: z.array(z.string()), costCentres: z.array(z.string()) })
  .strict();

export const misStatementResponseSchema: z.ZodType<MisStatementRouteResponse> = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("resolved"),
      scope: statementScopeSchema,
      tree: z.array(statementNodeSchema),
      grandTotal: statementNodeSchema,
      provenance: provenanceSchema,
      attestedContext: z.string().optional(),
      nodeMetadata: z.array(nodeMetadataSchema).optional(),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("unresolvable"),
      notice: z.literal("No mapping configured"),
      tree: z.tuple([]),
      grandTotal: z.null(),
      provenance: provenanceSchema,
    })
    .strict(),
  z
    .object({ outcome: z.literal("refresh-required"), notice: z.literal("The data was refreshed - ask again") })
    .strict(),
]);

export class MisStatementRunRequestDto extends MisSelectionRunRequestDto implements MisStatementRunRequest {
  @ApiProperty({ type: () => [MisStatementProvenanceBatchDto], required: false })
  pinnedBatches?: ProvenanceBatch[];
}

class MisStatementMeasureBlockBaseDto {
  @ApiProperty({ enum: ["selected", "fy26-27-ytd"] })
  key!: "selected" | "fy26-27-ytd";

  @ApiProperty({ example: "Jul 2026" })
  label!: string;

  @ApiProperty({ example: "2026-07-01" })
  from!: string;

  @ApiProperty({ example: "2026-07-01" })
  to!: string;

  @ApiProperty({ type: String, example: null, nullable: true })
  rollover: null = null;

  @ApiProperty({ example: "11512712.07" })
  actual!: FixedScaleMoney;

  @ApiProperty({ enum: ["matched", "budget-only", "actual-only"], isArray: true })
  sourcePresence!: SourcePresence[];
}

class MisStatementLoadedMeasureBlockDto
  extends MisStatementMeasureBlockBaseDto
  implements MisStatementLoadedMeasureBlock
{
  @ApiProperty({ enum: ["loaded"] })
  budgetState: "loaded" = "loaded";

  @ApiProperty({ example: "10050136.29" })
  budget!: FixedScaleMoney;

  @ApiProperty({ type: String, example: "1.1455", nullable: true })
  percentage!: string | null;
}

class MisStatementNotLoadedMeasureBlockDto
  extends MisStatementMeasureBlockBaseDto
  implements MisStatementNotLoadedMeasureBlock
{
  @ApiProperty({ enum: ["not-loaded"] })
  budgetState: "not-loaded" = "not-loaded";

  @ApiProperty({ type: String, example: null, nullable: true })
  budget: null = null;

  @ApiProperty({ type: String, example: null, nullable: true })
  percentage: null = null;
}

@ApiExtraModels(MisStatementLoadedMeasureBlockDto, MisStatementNotLoadedMeasureBlockDto)
class MisStatementNodeDto implements MisStatementNode {
  @ApiProperty({ example: "9|admin-expenses" })
  nodeKey!: string;

  @ApiProperty({ type: String, example: "9", nullable: true })
  sNo!: string | null;

  @ApiProperty({ example: "Admin Expenses" })
  budgetComponent!: string;

  @ApiProperty({ type: String, example: "55011101", nullable: true })
  glCode!: string | null;

  @ApiProperty({
    isArray: true,
    oneOf: [
      { $ref: "#/components/schemas/MisStatementLoadedMeasureBlockDto" },
      { $ref: "#/components/schemas/MisStatementNotLoadedMeasureBlockDto" },
    ],
  })
  measures!: Array<MisStatementLoadedMeasureBlockDto | MisStatementNotLoadedMeasureBlockDto>;

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

class MisStatementNodeMetadataDto implements MisStatementNodeMetadata {
  @ApiProperty() nodeKey!: string;
  @ApiProperty({ type: [String] }) glCodes!: string[];
  @ApiProperty({ type: [String] }) costCentres!: string[];
}

class MisStatementScopeReadoutDto {
  @ApiProperty({ example: "Agriculture" })
  department!: string;

  @ApiProperty({ example: "Nursery" })
  function!: string;

  @ApiProperty({ example: "DUB" })
  plant!: string;

  @ApiProperty({ example: "Agri - Nursery - DUB" })
  plantDisplay!: string;

  @ApiProperty({ example: false })
  provisional!: boolean;

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

  @ApiProperty({ required: false, description: "Signed canonical statement context." })
  attestedContext?: string;

  @ApiProperty({ type: [MisStatementNodeMetadataDto], required: false })
  nodeMetadata?: MisStatementNodeMetadataDto[];
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
