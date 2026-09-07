import { ApiProperty } from "@nestjs/swagger";

export class HealthDataDto {
  @ApiProperty({ example: "ok" })
  status: "ok" = "ok";
}

export class HealthResponseDto {
  @ApiProperty({ example: true })
  success: true = true;

  @ApiProperty({ type: HealthDataDto })
  data: HealthDataDto = new HealthDataDto();

  @ApiProperty({ type: "object", example: null, nullable: true })
  error: null = null;
}
