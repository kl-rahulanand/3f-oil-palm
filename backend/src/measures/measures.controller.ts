import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type {
  AuthoredMeasureInput,
  AuthoredMeasureView,
  AuthUser,
  MeasureAuthoringMetadataResponse,
  MeasureValidationResponse,
} from "@pulse/contract";
import { AuthGuard, CurrentUser, DbaGuard } from "../auth/auth.guard";
import { authoredMeasureInputSchema } from "./measures.schemas";
import { MeasuresService } from "./measures.service";

@ApiTags("measures")
@Controller("api/measures")
@UseGuards(AuthGuard, DbaGuard)
export class MeasuresController {
  constructor(private readonly measures: MeasuresService) {}

  @Get("metadata")
  @ApiOperation({ summary: "List trusted measure-authoring fields and options" })
  metadata(): MeasureAuthoringMetadataResponse {
    return this.measures.metadata();
  }

  @Get()
  @ApiOperation({ summary: "List latest authored measure versions" })
  list(): Promise<AuthoredMeasureView[]> {
    return this.measures.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a measure draft or a new version" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Measure draft created" })
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser): Promise<AuthoredMeasureView> {
    return this.measures.create(parseInput(body), actor);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an unpublished measure version" })
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ): Promise<AuthoredMeasureView> {
    return this.measures.update(id, parseInput(body), actor);
  }

  @Post(":id/validate")
  @ApiOperation({ summary: "Compile and run a measure draft through the verified query path" })
  validate(@Param("id") id: string, @CurrentUser() actor: AuthUser): Promise<MeasureValidationResponse> {
    return this.measures.validate(id, actor);
  }

  @Post(":id/publish")
  @ApiOperation({ summary: "Publish a currently validated measure version" })
  publish(@Param("id") id: string, @CurrentUser() actor: AuthUser): Promise<AuthoredMeasureView> {
    return this.measures.publish(id, actor);
  }
}

function parseInput(body: unknown): AuthoredMeasureInput {
  const parsed = authoredMeasureInputSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
  return parsed.data;
}

