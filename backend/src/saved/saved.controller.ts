import { BadRequestException, Body, Controller, Delete, Get, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, SaveQueryRequest, SavedQuery } from "@pulse/contract";
import { zodApiBody } from "../common/openapi";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import { SavedService } from "./saved.service";
import { saveQuerySchema } from "./saved.schemas";

@ApiTags("saved")
@Controller("api/saved")
@UseGuards(AuthGuard)
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Post()
  @UseGuards(RequireAction("save"))
  @ApiOperation({ summary: "Save a semantic selection for reuse" })
  @ApiBody(zodApiBody(saveQuerySchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: "Saved query created" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid or unauthorized selection" })
  create(@CurrentUser() user: AuthUser, @Body() body: SaveQueryRequest): Promise<SavedQuery> {
    const parsed = saveQuerySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.saved.create(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's saved queries" })
  @ApiResponse({ status: HttpStatus.OK, description: "Saved queries listed" })
  list(@CurrentUser() user: AuthUser): Promise<SavedQuery[]> {
    return this.saved.list(user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of the current user's saved queries" })
  @ApiParam({ name: "id", description: "Saved query id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Saved query deleted" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Saved query not found" })
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<{ ok: true }> {
    return this.saved.remove(user, id);
  }
}
