import { Controller, Get, HttpStatus, Inject, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { WarehouseFreshnessResponse } from "@3f/contract";
import { AuthGuard } from "../auth/auth.guard";
import { FreshnessErrorDto, FreshnessResponseDto } from "./freshness.dto";
import type { IFreshnessService } from "./freshness.interface";
import { FreshnessService } from "./freshness.service";

@ApiTags("Warehouse")
@Controller("api/warehouse")
@UseGuards(AuthGuard)
export class FreshnessController {
  constructor(@Inject(FreshnessService) private readonly service: IFreshnessService) {}

  @Get("freshness")
  @ApiOperation({
    summary: "Get warehouse load freshness",
    description: "Reports the oldest active batch upload time. This is load freshness, not data currency.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Load freshness reported.", type: FreshnessResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: FreshnessErrorDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Authentication is required.", type: FreshnessErrorDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Access is forbidden.", type: FreshnessErrorDto })
  freshness(): Promise<WarehouseFreshnessResponse> {
    return this.service.freshness();
  }
}
