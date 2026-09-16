import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, MisDrillResponse } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction, SessionId } from "../auth/auth.guard";
import { CSRF_HEADER } from "../auth/cookies";
import { MisSelectionErrorDto } from "./mis-selection.dto";
import { MisDrillAuditFilter } from "./mis-drill.audit.filter";
import { MisDrillRequestDto, MisDrillResponseDto, misDrillRequestSchema } from "./mis-drill.dto";
import type { IMisDrillService } from "./mis-drill.interface";
import { AuditedDrillRefusalException } from "./mis-drill.interface";
import { MisDrillService } from "./mis-drill.service";

@ApiTags("MIS")
@ApiExtraModels(MisDrillRequestDto, MisDrillResponseDto, MisSelectionErrorDto)
@Controller("api/mis")
@UseGuards(AuthGuard)
export class MisDrillController {
  constructor(@Inject(MisDrillService) private readonly drills: IMisDrillService) {}

  @Post("statement/drill")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAction("report"))
  @UseFilters(MisDrillAuditFilter)
  @ApiOperation({
    summary: "Read the transactions behind a statement leaf",
    description: "Returns one fixed-size page and an exact full-result footer under the statement's pinned batches.",
  })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: MisDrillRequestDto })
  @ApiResponse({ status: HttpStatus.OK, description: "Pinned transaction page and footer.", type: MisDrillResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid drill request.", type: MisSelectionErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: MisSelectionErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF, plant scope, or governed report access validation failed.",
    type: MisSelectionErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "The pinned statement snapshot is stale.",
    type: MisSelectionErrorDto,
  })
  async run(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Body() body: unknown,
  ): Promise<MisDrillResponse> {
    const parsed = misDrillRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    const outcome = await this.drills.run(user, sessionId, parsed.data);
    if (outcome.outcome === "ok" || outcome.outcome === "replaced") {
      const { rollup: _rollup, budgetState: _budgetState, ...response } = outcome.response;
      if (response.pageSize !== 100) throw new Error("Drill seam returned an invalid panel page size");
      return response as MisDrillResponse;
    }
    if (outcome.outcome === "audit-failed") throw new ServiceUnavailableException(outcome.message);
    throw new AuditedDrillRefusalException(outcome.status, outcome.message, outcome.batchStatuses);
  }
}
