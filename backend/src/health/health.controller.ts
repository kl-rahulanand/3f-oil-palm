import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseDto } from "./health-response.dto";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Check API liveness" })
  @ApiOkResponse({ type: HealthResponseDto, description: "The API is available." })
  health(): HealthResponseDto {
    return new HealthResponseDto();
  }
}
