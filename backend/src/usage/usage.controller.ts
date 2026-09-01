import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AdminUsageRow, AdminUsageSeriesResponse } from "@pulse/contract";
import { AuthGuard, AdminGuard } from "../auth/auth.guard";
import { UsageService } from "./usage.service";
import { usageQuerySchema, usageSeriesQuerySchema } from "./usage.schemas";

@ApiTags("admin-usage")
@Controller("api/admin/usage")
@UseGuards(AuthGuard, AdminGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get("series")
  @ApiOperation({ summary: "List query and token usage over time" })
  @ApiResponse({ status: HttpStatus.OK, description: "Usage series listed" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid usage series query" })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Unauthenticated request" })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Authenticated user is not admin" })
  series(@Query() query: unknown): Promise<AdminUsageSeriesResponse> {
    const parsed = usageSeriesQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.usage.series(parsed.data);
  }

  @Get()
  @ApiOperation({ summary: "List per-user query and token usage" })
  @ApiResponse({ status: HttpStatus.OK, description: "Usage listed" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid usage query window" })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Unauthenticated request" })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Authenticated user is not admin" })
  list(@Query() query: unknown): Promise<AdminUsageRow[]> {
    const parsed = usageQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.usage.list(parsed.data);
  }
}
