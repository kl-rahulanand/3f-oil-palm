import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { AuthUser, MisSelectionOptionsResponse, MisSelectionRunResponse } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction } from "../auth/auth.guard";
import {
  MisSelectionErrorDto,
  MisSelectionOptionsResponseDto,
  MisSelectionResolvedResponseDto,
  MisSelectionRunRequestDto,
  MisSelectionUnresolvableResponseDto,
  misSelectionRunRequestSchema,
} from "./mis-selection.dto";
import type { IMisSelectionService } from "./mis-selection.interface";
import { MisSelectionService } from "./mis-selection.service";

@ApiTags("MIS")
@ApiExtraModels(MisSelectionResolvedResponseDto, MisSelectionUnresolvableResponseDto)
@Controller("api/mis")
@UseGuards(AuthGuard)
export class MisSelectionController {
  constructor(@Inject(MisSelectionService) private readonly selections: IMisSelectionService) {}

  @Get("options")
  @UseGuards(RequireAction("report"))
  @ApiOperation({
    summary: "List governed MIS selector options",
    description: "Returns Mapping Master choices and periods derived only from active loaded actuals batches.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Selector options listed.", type: MisSelectionOptionsResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid request.", type: MisSelectionErrorDto })
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
  options(@CurrentUser() user: AuthUser): Promise<MisSelectionOptionsResponse> {
    return this.selections.options(user);
  }

  @Post("run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAction("report"))
  @ApiOperation({
    summary: "Run a governed MIS selection",
    description:
      "Resolves the four selectors through the Mapping Master and executes the server-owned governed financial query.",
  })
  @ApiBody({ type: MisSelectionRunRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Selection resolved or reported as unresolvable.",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(MisSelectionResolvedResponseDto) },
        { $ref: getSchemaPath(MisSelectionUnresolvableResponseDto) },
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
  run(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<MisSelectionRunResponse> {
    const parsed = misSelectionRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    return this.selections.run(user, parsed.data);
  }
}
