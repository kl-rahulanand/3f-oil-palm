import { Controller, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthUser, IngestActualsResponse, IngestBudgetResponse } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import { CSRF_HEADER } from "../auth/cookies";
import {
  IngestActualsErrorDto,
  IngestActualsMultipartDto,
  IngestActualsResponseDto,
  IngestBudgetMultipartDto,
  IngestBudgetResponseDto,
  MAX_ACTUALS_UPLOAD_BYTES,
} from "./ingest.schemas";
import { IngestService, type UploadedWorkbook } from "./ingest.service";

@ApiTags("Ingest")
@Controller("api/ingest")
@UseGuards(AuthGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post("actuals")
  @UseGuards(RequireAction("ingest"))
  @UseInterceptors(FileInterceptor("file", { limits: { files: 1, fileSize: MAX_ACTUALS_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "Replace one period of SAP actuals",
    description:
      "Requires an authenticated session with the ingest grant and a matching CSRF token. Validates the complete SAP Base Report before activating a new auditable period batch.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: IngestActualsMultipartDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Actuals batch activated.", type: IngestActualsResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Workbook validation failed.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or ingest grant validation failed.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: "Workbook exceeds a configured limit.",
    type: IngestActualsErrorDto,
  })
  actuals(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbook | undefined,
  ): Promise<IngestActualsResponse> {
    return this.ingest.ingestActuals(file, user.id);
  }

  @Post("budget")
  @UseGuards(RequireAction("ingest"))
  @UseInterceptors(FileInterceptor("file", { limits: { files: 1, fileSize: MAX_ACTUALS_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: "Replace the present periods of the MIS budget",
    description:
      "Requires an authenticated session with the ingest grant and a matching CSRF token. Validates the complete MIS workbook before atomically activating one auditable batch per present period.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: IngestBudgetMultipartDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Budget batches activated.", type: IngestBudgetResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Workbook validation failed.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "CSRF or ingest grant validation failed.",
    type: IngestActualsErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: "Workbook exceeds a configured limit.",
    type: IngestActualsErrorDto,
  })
  budget(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbook | undefined,
  ): Promise<IngestBudgetResponse> {
    return this.ingest.ingestBudget(file, user.id);
  }
}
