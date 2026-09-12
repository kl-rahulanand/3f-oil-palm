import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { Response } from "express";
import type {
  AuthUser,
  MisStatementRefreshRequiredResponse,
  MisStatementRouteResponse,
  MisStatementUnresolvableResponse,
} from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import { CSRF_HEADER } from "../auth/cookies";
import { MisSelectionErrorDto, MisSelectionRunRequestDto, misSelectionRunRequestSchema } from "./mis-selection.dto";
import type { IMisStatementExportService } from "./mis-statement-export.interface";
import { MisStatementExportService } from "./mis-statement-export.service";
import {
  MisStatementRefreshRequiredResponseDto,
  MisStatementResolvedResponseDto,
  MisStatementRunRequestDto,
  MisStatementUnresolvableResponseDto,
  misStatementRunRequestSchema,
} from "./mis-statement.dto";
import type { IMisStatementService } from "./mis-statement.interface";
import { MisStatementService } from "./mis-statement.service";

@ApiTags("MIS")
@ApiExtraModels(
  MisStatementResolvedResponseDto,
  MisStatementUnresolvableResponseDto,
  MisStatementRefreshRequiredResponseDto,
)
@Controller("api/mis")
@UseGuards(AuthGuard)
export class MisStatementController {
  constructor(
    @Inject(MisStatementService) private readonly statements: IMisStatementService,
    @Inject(MisStatementExportService) private readonly exporter: IMisStatementExportService,
  ) {}

  @Post("statement")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAction("report"))
  @ApiOperation({
    summary: "Build the governed MIS statement",
    description:
      "Returns the selected-period budget outline with derived subtotals, FY 26-27 YTD measures, scope, and provenance.",
  })
  @ApiBody({ type: MisStatementRunRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statement resolved or reported as unresolvable.",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(MisStatementResolvedResponseDto) },
        { $ref: getSchemaPath(MisStatementUnresolvableResponseDto) },
        { $ref: getSchemaPath(MisStatementRefreshRequiredResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid selector payload.", type: MisSelectionErrorDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Authentication is required.",
    type: MisSelectionErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Governed report access is required.",
    type: MisSelectionErrorDto,
  })
  run(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<MisStatementRouteResponse> {
    const parsed = misStatementRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    return this.statements.run(user, parsed.data);
  }

  @Post("statement/export")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAction("report"))
  @ApiOperation({
    summary: "Export the governed MIS statement",
    description:
      "Returns the unresolvable JSON outcome or streams the resolved statement as an Excel workbook built from the same request payload.",
  })
  @ApiHeader({ name: CSRF_HEADER, required: true, description: "Token matching the 3f_csrf cookie." })
  @ApiBody({ type: MisSelectionRunRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statement workbook streamed or selection reported as unresolvable.",
    headers: {
      "Content-Disposition": {
        description: "Attachment filename for a resolved statement.",
        schema: { type: "string" },
      },
    },
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
      "application/json": { schema: { $ref: getSchemaPath(MisStatementUnresolvableResponseDto) } },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid selector payload.", type: MisSelectionErrorDto })
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
  async export(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MisStatementUnresolvableResponse | MisStatementRefreshRequiredResponse | StreamableFile> {
    const parsed = misSelectionRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    const statement = await this.statements.run(user, parsed.data);
    if (statement.outcome !== "resolved") return statement;

    const workbook = await this.exporter.write(statement);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${statementFilename(statement)}"`);
    return new StreamableFile(workbook);
  }
}

function statementFilename(statement: Extract<MisStatementRouteResponse, { outcome: "resolved" }>): string {
  const block = statement.grandTotal.measures.find(({ key }) => key === "selected") ?? statement.grandTotal.measures[0];
  return `financial-mis-${slug(statement.scope.department)}-${slug(statement.scope.function)}-${slug(statement.scope.plant)}-${slug(block.from)}-to-${slug(block.to)}.xlsx`;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
