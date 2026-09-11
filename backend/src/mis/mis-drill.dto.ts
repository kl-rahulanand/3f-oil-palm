import { ApiProperty } from "@nestjs/swagger";
import type {
  FixedScaleMoney,
  MisDrillBatchStatus,
  MisDrillFooter,
  MisDrillLine,
  MisDrillRequest,
  MisDrillResponse,
} from "@3f/contract";
import { z } from "zod";

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);
const pinnedBatchSchema = z
  .object({
    source: z.enum(["actuals", "budget"]),
    period: monthSchema,
    batchId: z.string().uuid(),
  })
  .strict();

export const misDrillRequestSchema = z
  .object({
    department: z.string().trim().min(1),
    function: z.string().trim().min(1),
    plant: z.string().trim().min(1),
    period: z.string().trim().min(1),
    nodeKey: z.string().trim().min(1),
    block: z.enum(["selected", "fy26-27-ytd"]),
    pinnedBatches: z.array(pinnedBatchSchema).min(1).max(50),
    page: z.number().int().min(1).max(1_000_000),
  })
  .strict();

class MisDrillPinnedBatchDto {
  @ApiProperty({ enum: ["actuals", "budget"] })
  source!: "actuals" | "budget";
  @ApiProperty({ example: "2026-07-01" })
  period!: string;
  @ApiProperty({ format: "uuid" })
  batchId!: string;
}

export class MisDrillRequestDto implements MisDrillRequest {
  @ApiProperty({ example: "Agriculture" }) department!: string;
  @ApiProperty({ example: "Nursery" }) function!: string;
  @ApiProperty({ example: "DUB" }) plant!: string;
  @ApiProperty({ example: "2026-07-01" }) period!: string;
  @ApiProperty({ example: "9.1|55011101|office-electricity-expenses" }) nodeKey!: string;
  @ApiProperty({ enum: ["selected", "fy26-27-ytd"] }) block!: "selected" | "fy26-27-ytd";
  @ApiProperty({ type: [MisDrillPinnedBatchDto] }) pinnedBatches!: MisDrillPinnedBatchDto[];
  @ApiProperty({ minimum: 1, maximum: 1_000_000, example: 1 }) page!: number;
}

class MisDrillBatchStatusDto implements MisDrillBatchStatus {
  @ApiProperty({ enum: ["actuals", "budget"] })
  source!: "actuals" | "budget";
  @ApiProperty({ example: "2026-07-01" })
  period!: string;
  @ApiProperty({ format: "uuid" }) requestedBatchId!: string;
  @ApiProperty({ enum: ["current", "replaced", "gone"] }) status!: "current" | "replaced" | "gone";
  @ApiProperty({ format: "uuid", nullable: true }) activeBatchId!: string | null;
}

class MisDrillLineDto implements MisDrillLine {
  @ApiProperty({ example: "2026-07-01" }) month!: string;
  @ApiProperty({ example: "2026-07-14" }) postingDate!: string;
  @ApiProperty({ example: "125.00" }) debit!: FixedScaleMoney;
  @ApiProperty({ example: "0.00" }) credit!: FixedScaleMoney;
  @ApiProperty({ example: "125.00" }) value!: FixedScaleMoney;
  @ApiProperty({ nullable: true }) reference!: string | null;
  @ApiProperty({ nullable: true }) memo!: string | null;
}

class MisDrillFooterDto implements MisDrillFooter {
  @ApiProperty({ example: "125.00" }) debit!: FixedScaleMoney;
  @ApiProperty({ example: "0.00" }) credit!: FixedScaleMoney;
  @ApiProperty({ example: "125.00" }) value!: FixedScaleMoney;
}

export class MisDrillResponseDto implements MisDrillResponse {
  @ApiProperty() nodeKey!: string;
  @ApiProperty() leafKey!: string;
  @ApiProperty({ type: [MisDrillLineDto] }) lines!: MisDrillLineDto[];
  @ApiProperty({ type: MisDrillFooterDto }) footer!: MisDrillFooterDto;
  @ApiProperty() totalCount!: number;
  @ApiProperty() page!: number;
  @ApiProperty({ enum: [100] }) pageSize: 100 = 100;
  @ApiProperty({ type: [String], format: "uuid" }) actualBatchIds!: string[];
  @ApiProperty({ format: "uuid" }) budgetBatchId!: string;
  @ApiProperty({ type: [MisDrillBatchStatusDto] }) batchStatuses!: MisDrillBatchStatusDto[];
}
