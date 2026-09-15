import { ApiProperty } from "@nestjs/swagger";
import type { Environment, ErrorEnvelope, ErrorFieldDetail, ErrorPayload } from "@3f/contract";

class FreshnessSourceDto {
  @ApiProperty({ enum: ["actuals", "budget"], example: "actuals" })
  source!: "actuals" | "budget";

  @ApiProperty({ format: "date-time", example: "2026-09-01T08:00:00.000Z" })
  oldestUploadedAtUtc!: string;
}

export class FreshnessResponseDto {
  @ApiProperty({ enum: ["available", "no-active-batches", "unsupported", "unconfigured", "lookup-failed"] })
  status!: "available" | "no-active-batches" | "unsupported" | "unconfigured" | "lookup-failed";

  @ApiProperty({ enum: ["load"], description: "Upload/load freshness, not the period or data currency." })
  freshnessKind: "load" = "load";

  @ApiProperty({ format: "date-time", required: false, example: "2026-09-01T08:00:00.000Z" })
  oldestUploadedAtUtc?: string;

  @ApiProperty({ type: [FreshnessSourceDto], required: false })
  sources?: FreshnessSourceDto[];
}

class FreshnessErrorFieldDto implements ErrorFieldDetail {
  @ApiProperty({ example: "request" })
  field!: string;

  @ApiProperty({ example: "invalid" })
  reason!: string;
}

class FreshnessErrorDetailsDto {
  @ApiProperty({ type: [FreshnessErrorFieldDto], required: false })
  fieldErrors?: FreshnessErrorFieldDto[];
}

class FreshnessErrorPayloadDto implements ErrorPayload {
  @ApiProperty({ format: "uuid" })
  errorId!: string;

  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ example: "ValidationError" })
  type!: string;

  @ApiProperty({ example: "HTTP exception" })
  message!: string;

  @ApiProperty({ example: "The request is invalid" })
  userMessage!: string;

  @ApiProperty({ type: FreshnessErrorDetailsDto })
  details!: FreshnessErrorDetailsDto;

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

export class FreshnessErrorDto implements ErrorEnvelope {
  @ApiProperty({ example: false })
  success: false = false;

  @ApiProperty({ type: "object", example: null, nullable: true })
  data: null = null;

  @ApiProperty({ type: FreshnessErrorPayloadDto })
  error!: FreshnessErrorPayloadDto;
}
