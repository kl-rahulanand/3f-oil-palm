import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  Environment,
  ErrorEnvelope,
  ErrorFieldDetail,
  ErrorPayload,
  MisSelectionBucketRow,
  MisSelectionOptionsResponse,
  MisSelectionPeriodOption,
  MisSelectionResolvedResponse,
  MisSelectionRunRequest,
  MisSelectionScopeReadout,
  MisSelectionTotals,
  MisSelectionUnresolvableResponse,
  ResultTable,
} from "@3f/contract";
import { z } from "zod";

export const misSelectionRunRequestSchema = z
  .object({
    department: z.string().trim().min(1),
    function: z.string().trim().min(1),
    plant: z.string().trim().min(1),
    period: z.string().trim().min(1),
  })
  .strict();

export class MisSelectionRunRequestDto implements MisSelectionRunRequest {
  @ApiProperty({ example: "Agriculture" })
  department!: string;

  @ApiProperty({ example: "Nursery" })
  function!: string;

  @ApiProperty({ example: "DUB" })
  plant!: string;

  @ApiProperty({ example: "2026-07-01" })
  period!: string;
}

export class MisSelectionPeriodOptionDto implements MisSelectionPeriodOption {
  @ApiProperty({ example: "2026-07-01" })
  value!: string;

  @ApiProperty({ example: "2026-07-01" })
  label!: string;

  @ApiProperty({ example: "2026-07-01" })
  from!: string;

  @ApiProperty({ example: "2026-07-01" })
  to!: string;
}

class MisSelectionPlantOptionDto {
  @ApiProperty({ example: "DUB" })
  value!: string;

  @ApiProperty({ example: "Agri - Nursery - DUB" })
  label!: string;

  @ApiProperty({ example: ["DUB", "DUB-NUR", "Agri - Nursery - DUB"] })
  aliases!: string[];

  @ApiProperty({ example: false })
  provisional!: boolean;

  @ApiPropertyOptional({ example: "Agriculture" })
  department?: string;

  @ApiPropertyOptional({ example: "Nursery" })
  function?: string;
}

export class MisSelectionOptionsResponseDto implements MisSelectionOptionsResponse {
  @ApiProperty({ example: ["Agriculture"] })
  departments!: string[];

  @ApiProperty({ example: ["Nursery"] })
  functions!: string[];

  @ApiProperty({ type: [MisSelectionPlantOptionDto] })
  plants!: MisSelectionPlantOptionDto[];

  @ApiProperty({ type: [MisSelectionPeriodOptionDto] })
  periods!: MisSelectionPeriodOptionDto[];
}

class MisSelectionScopeReadoutDto implements MisSelectionScopeReadout {
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

class MisSelectionResultTableDto implements ResultTable {
  @ApiProperty({ type: "array", items: { type: "object" } })
  columns!: ResultTable["columns"];

  @ApiProperty({ type: "array", items: { type: "object" } })
  rows!: ResultTable["rows"];
}

class MisSelectionTotalsDto implements MisSelectionTotals {
  @ApiProperty({ example: 125 })
  actual!: number;

  @ApiProperty({ example: 200 })
  budget!: number;

  @ApiProperty({ example: 0.625, nullable: true })
  percentage!: number | null;
}

class MisSelectionBucketRowDto implements MisSelectionBucketRow {
  @ApiProperty({ example: "DUB" })
  plant!: string;

  @ApiProperty({ example: ["Primary", "Secondary"], type: [String] })
  costCentres!: string[];

  @ApiProperty({ example: "50001701" })
  glCode!: string;

  @ApiProperty({ example: "unmapped-GL" })
  misLine!: string;

  @ApiProperty({ example: true })
  provisional!: boolean;

  @ApiProperty({ example: "GL absent from Sheet1" })
  reason!: string;

  @ApiProperty({ example: 125 })
  actual!: number;

  @ApiProperty({ example: 200 })
  budget!: number;
}

export class MisSelectionResolvedResponseDto implements MisSelectionResolvedResponse {
  @ApiProperty({ enum: ["resolved"] })
  outcome: "resolved" = "resolved";

  @ApiProperty({ type: MisSelectionScopeReadoutDto })
  scope!: MisSelectionScopeReadoutDto;

  @ApiProperty({ type: MisSelectionResultTableDto })
  result!: MisSelectionResultTableDto;

  @ApiProperty({ type: MisSelectionTotalsDto })
  totals!: MisSelectionTotalsDto;

  @ApiProperty({ type: [MisSelectionBucketRowDto] })
  bucketRows!: MisSelectionBucketRowDto[];
}

export class MisSelectionUnresolvableResponseDto implements MisSelectionUnresolvableResponse {
  @ApiProperty({ enum: ["unresolvable"] })
  outcome: "unresolvable" = "unresolvable";

  @ApiProperty({ enum: ["No mapping configured"] })
  notice: "No mapping configured" = "No mapping configured";

  @ApiProperty({ type: MisSelectionResultTableDto })
  result!: MisSelectionResultTableDto;

  @ApiProperty({ type: MisSelectionTotalsDto })
  totals!: MisSelectionTotalsDto;

  @ApiProperty({ type: [MisSelectionBucketRowDto], maxItems: 0 })
  bucketRows: [] = [];
}

class MisSelectionErrorFieldDto implements ErrorFieldDetail {
  @ApiProperty({ example: "period" })
  field!: string;

  @ApiProperty({ example: "invalid" })
  reason!: string;
}

class MisSelectionErrorDetailsDto {
  @ApiProperty({ type: [MisSelectionErrorFieldDto], required: false })
  fieldErrors?: MisSelectionErrorFieldDto[];
}

class MisSelectionErrorPayloadDto implements ErrorPayload {
  @ApiProperty({ format: "uuid" })
  errorId!: string;

  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ example: "ValidationError" })
  type!: string;

  @ApiProperty({ example: "HTTP exception" })
  message!: string;

  @ApiProperty({ example: "The request contains invalid fields" })
  userMessage!: string;

  @ApiProperty({ type: MisSelectionErrorDetailsDto })
  details!: MisSelectionErrorDetailsDto;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ format: "uuid" })
  correlationId!: string;

  @ApiProperty({ nullable: true })
  requestId!: string | null;

  @ApiProperty({ enum: ["Local", "Development", "QA", "UAT", "Staging", "Production"] })
  environment!: Environment;

  @ApiProperty({ format: "date-time" })
  timestampUtc!: string;
}

export class MisSelectionErrorDto implements ErrorEnvelope {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ type: "object", example: null, nullable: true })
  data: null = null;

  @ApiProperty({ type: MisSelectionErrorPayloadDto })
  error!: MisSelectionErrorPayloadDto;
}
