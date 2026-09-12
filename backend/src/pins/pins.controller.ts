import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, Pin } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction, SessionId } from "../auth/auth.guard";
import { CSRF_HEADER } from "../auth/cookies";
import { ExplorationAuditFilter } from "../common/exploration-audit.filter";
import { ExplorationDeleteResponseDto, ExplorationErrorDto } from "../saved/saved.schemas";
import { PinsService } from "./pins.service";
import {
  CreatePinRequestDto,
  PinResponseDto,
  ReorderPinsRequestDto,
  UpdatePinViewRequestDto,
  createPinSchema,
  reorderPinsSchema,
  updatePinViewSchema,
} from "./pins.schemas";

@ApiTags("Pins")
@ApiExtraModels(CreatePinRequestDto, UpdatePinViewRequestDto, ReorderPinsRequestDto, PinResponseDto)
@Controller("api/pins")
@UseGuards(AuthGuard, RequireAction("pin"))
@UseFilters(ExplorationAuditFilter)
export class PinsController {
  constructor(private readonly pins: PinsService) {}

  @Post()
  @ApiOperation({ summary: "Pin a semantic selection to the current user's dashboard" })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: CreatePinRequestDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Pin created.", type: PinResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid selection.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or pin grant validation failed.",
    type: ExplorationErrorDto,
  })
  create(@CurrentUser() user: AuthUser, @SessionId() sessionId: string, @Body() body: unknown): Promise<Pin> {
    const parsed = createPinSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.create(user, sessionId, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's dashboard pins" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pins listed.", type: PinResponseDto, isArray: true })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Pin grant validation failed.", type: ExplorationErrorDto })
  list(@CurrentUser() user: AuthUser, @SessionId() sessionId: string): Promise<Pin[]> {
    return this.pins.list(user, sessionId);
  }

  @Patch("reorder")
  @ApiOperation({ summary: "Reorder the current user's dashboard pins" })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: ReorderPinsRequestDto })
  @ApiResponse({ status: HttpStatus.OK, description: "Pins reordered.", type: PinResponseDto, isArray: true })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid pin order.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or pin grant validation failed.",
    type: ExplorationErrorDto,
  })
  reorder(@CurrentUser() user: AuthUser, @SessionId() sessionId: string, @Body() body: unknown): Promise<Pin[]> {
    const parsed = reorderPinsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.reorder(user, sessionId, parsed.data.orderedIds);
  }

  @Patch(":id/view")
  @ApiOperation({ summary: "Update presentation preferences for one of the current user's pins" })
  @ApiParam({ name: "id", description: "Pin id" })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: UpdatePinViewRequestDto })
  @ApiResponse({ status: HttpStatus.OK, description: "Pin view updated.", type: PinResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid pin view.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or pin grant validation failed.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Pin not found.", type: ExplorationErrorDto })
  updateView(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Pin> {
    const parsed = updatePinViewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.updateView(user, sessionId, id, parsed.data.view);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of the current user's pins" })
  @ApiParam({ name: "id", description: "Pin id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pin deleted.", type: ExplorationDeleteResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: ExplorationErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or pin grant validation failed.",
    type: ExplorationErrorDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Pin not found.", type: ExplorationErrorDto })
  remove(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.pins.remove(user, sessionId, id);
  }
}
