import { BadRequestException, Body, Controller, Get, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, ReportRunResult, ReportSummary } from "@pulse/contract";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ReportsService } from "./reports.service";
import { reportIdParamSchema, runReportBodySchema } from "./reports.schemas";

@ApiTags("reports")
@Controller("api/reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: "List curated reports available to the current user" })
  @ApiResponse({ status: HttpStatus.OK, description: "Reports listed" })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Unauthenticated request" })
  list(@CurrentUser() user: AuthUser): ReportSummary[] {
    return this.reports.list(user);
  }

  @Post(":id/run")
  @ApiOperation({ summary: "Run a curated report through the deterministic selection path" })
  @ApiParam({ name: "id", description: "Report id" })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        timeWindow: {
          type: "object",
          properties: {
            from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            column: { type: "string", minLength: 1, maxLength: 64 },
          },
          required: ["from", "to"],
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Report run" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid or unauthorized report selection" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Report not found" })
  run(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body?: unknown): Promise<ReportRunResult> {
    const parsedId = reportIdParamSchema.safeParse(id);
    if (!parsedId.success) throw new BadRequestException(parsedId.error.issues[0]?.message);

    const parsedBody = runReportBodySchema.safeParse(body ?? {});
    if (!parsedBody.success) throw new BadRequestException(parsedBody.error.issues[0]?.message);

    return this.reports.run(user, parsedId.data, parsedBody.data.timeWindow);
  }
}
