import { BadRequestException, Body, Controller, Delete, Get, HttpStatus, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, CreatePinRequest, Pin, UpdatePinViewRequest } from "@3f/contract";
import { zodApiBody } from "../common/openapi";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import { PinsService } from "./pins.service";
import { createPinSchema, reorderPinsSchema, updatePinViewSchema } from "./pins.schemas";
import { PinRefreshService } from "./pin-refresh.service";

@ApiTags("pins")
@Controller("api/pins")
@UseGuards(AuthGuard)
export class PinsController {
  constructor(
    private readonly pins: PinsService,
    private readonly refresh: PinRefreshService,
  ) {}

  @Post()
  @UseGuards(RequireAction("pin"))
  @ApiOperation({ summary: "Pin a semantic selection to the current user's dashboard" })
  @ApiBody(zodApiBody(createPinSchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: "Pin created" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid or unauthorized selection" })
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePinRequest): Promise<Pin> {
    const parsed = createPinSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.create(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's dashboard pins" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pins listed" })
  list(@CurrentUser() user: AuthUser): Promise<Pin[]> {
    return this.pins.list(user);
  }

  @Post("refresh-all")
  @ApiOperation({ summary: "Refresh all of the current user's pinned snapshots" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pins refreshed" })
  async refreshAll(@CurrentUser() user: AuthUser): Promise<Pin[]> {
    await this.refresh.refreshAllForUser(user);
    return this.pins.list(user);
  }

  @Post(":id/refresh")
  @ApiOperation({ summary: "Refresh one of the current user's pinned snapshots" })
  @ApiParam({ name: "id", description: "Pin id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pin refreshed" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Pin not found" })
  async refreshOne(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<Pin> {
    await this.refresh.refreshOne(user, id);
    const pin = (await this.pins.list(user)).find((row) => row.id === id);
    if (!pin) throw new NotFoundException("Pin not found");
    return pin;
  }

  @Patch("reorder")
  @ApiOperation({ summary: "Reorder the current user's dashboard pins" })
  @ApiBody(zodApiBody(reorderPinsSchema))
  @ApiResponse({ status: HttpStatus.OK, description: "Pins reordered" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid pin order" })
  reorder(@CurrentUser() user: AuthUser, @Body() body: { orderedIds: string[] }): Promise<Pin[]> {
    const parsed = reorderPinsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.reorder(user, parsed.data.orderedIds);
  }

  @Patch(":id/view")
  @ApiOperation({ summary: "Update presentation preferences for one of the current user's pins" })
  @ApiParam({ name: "id", description: "Pin id" })
  @ApiBody(zodApiBody(updatePinViewSchema))
  @ApiResponse({ status: HttpStatus.OK, description: "Pin view updated" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid pin view" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Pin not found" })
  updateView(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdatePinViewRequest,
  ): Promise<Pin> {
    const parsed = updatePinViewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.pins.updateView(user.id, id, parsed.data.view);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of the current user's pins" })
  @ApiParam({ name: "id", description: "Pin id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Pin deleted" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Pin not found" })
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<{ ok: true }> {
    return this.pins.remove(user, id);
  }
}
