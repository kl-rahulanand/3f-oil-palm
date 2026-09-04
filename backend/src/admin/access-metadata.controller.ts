import { Controller, Get, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AccessMetadataResponse } from "@3f/contract";
import { AdminGuard, AuthGuard } from "../auth/auth.guard";
import { AccessMetadataService } from "./access-metadata.service";

@ApiTags("admin-access-metadata")
@Controller("api/admin/access-metadata")
@UseGuards(AuthGuard, AdminGuard)
export class AccessMetadataController {
  constructor(private readonly accessMetadata: AccessMetadataService) {}

  @Get()
  @ApiOperation({ summary: "Get access-management picker metadata" })
  @ApiResponse({ status: HttpStatus.OK, description: "Access metadata returned." })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Unauthenticated request." })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Authenticated user is not an admin.",
  })
  get(): Promise<AccessMetadataResponse> {
    return this.accessMetadata.get();
  }
}
