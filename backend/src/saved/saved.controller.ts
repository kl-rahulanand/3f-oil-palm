import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, SavedQuery } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction, SessionId } from "../auth/auth.guard";
import { CSRF_HEADER } from "../auth/cookies";
import { ExplorationAuditFilter } from "../common/exploration-audit.filter";
import { SavedService } from "./saved.service";
import {
  ExplorationDeleteResponseDto,
  ExplorationErrorDto,
  SaveQueryRequestDto,
  SavedQueryResponseDto,
  saveQuerySchema,
} from "./saved.schemas";

@ApiTags("Saved")
@ApiExtraModels(SaveQueryRequestDto, SavedQueryResponseDto, ExplorationDeleteResponseDto, ExplorationErrorDto)
@Controller("api/saved")
@UseGuards(AuthGuard, RequireAction("save"))
@UseFilters(ExplorationAuditFilter)
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Post()
  @ApiOperation({ summary: "Save a semantic selection for reuse" })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: SaveQueryRequestDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Saved query created.", type: SavedQueryResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid selection.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or save grant validation failed.",
    type: ExplorationErrorDto,
  })
  create(@CurrentUser() user: AuthUser, @SessionId() sessionId: string, @Body() body: unknown): Promise<SavedQuery> {
    const parsed = saveQuerySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.saved.create(user, sessionId, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's saved queries" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Saved queries listed.",
    type: SavedQueryResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Save grant validation failed.",
    type: ExplorationErrorDto,
  })
  list(@CurrentUser() user: AuthUser, @SessionId() sessionId: string): Promise<SavedQuery[]> {
    return this.saved.list(user, sessionId);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of the current user's saved queries" })
  @ApiParam({ name: "id", description: "Saved query id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Saved query deleted.", type: ExplorationDeleteResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or save grant validation failed.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Saved query not found.", type: ExplorationErrorDto })
  remove(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.saved.remove(user, sessionId, id);
  }
}
