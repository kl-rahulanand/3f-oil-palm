import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { AuthUser, MisStatementRunResponse } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import { MisSelectionErrorDto, MisSelectionRunRequestDto, misSelectionRunRequestSchema } from "./mis-selection.dto";
import { MisStatementResolvedResponseDto, MisStatementUnresolvableResponseDto } from "./mis-statement.dto";
import type { IMisStatementService } from "./mis-statement.interface";
import { MisStatementService } from "./mis-statement.service";

@ApiTags("MIS")
@ApiExtraModels(MisStatementResolvedResponseDto, MisStatementUnresolvableResponseDto)
@Controller("api/mis")
@UseGuards(AuthGuard)
export class MisStatementController {
  constructor(@Inject(MisStatementService) private readonly statements: IMisStatementService) {}

  @Post("statement")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAction("report"))
  @ApiOperation({
    summary: "Build the governed MIS statement",
    description:
      "Returns the selected-period budget outline with derived subtotals, FY 26-27 YTD measures, scope, and provenance.",
  })
  @ApiBody({ type: MisSelectionRunRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statement resolved or reported as unresolvable.",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(MisStatementResolvedResponseDto) },
        { $ref: getSchemaPath(MisStatementUnresolvableResponseDto) },
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
  run(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<MisStatementRunResponse> {
    const parsed = misSelectionRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    return this.statements.run(user, parsed.data);
  }
}
