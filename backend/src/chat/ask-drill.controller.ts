import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AskDrillResponse, AuthUser } from "@3f/contract";
import { AuthGuard, CurrentUser, RequireAction, SessionId } from "../auth/auth.guard";
import { AskDrillRequestDto, AskDrillResponseDto, askDrillSchema } from "./chat.schemas";
import { AskDrillService } from "./ask-drill.service";

@ApiTags("chat")
@Controller("api/chat")
@UseGuards(AuthGuard, RequireAction("report"))
export class AskDrillController {
  constructor(private readonly drills: AskDrillService) {}

  @Post("drill")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Open an Ask Actual's transactions",
    description: "Verifies the signed answer context and returns one fixed-size page with an all-match footer.",
  })
  @ApiBody({ type: AskDrillRequestDto })
  @ApiResponse({ status: HttpStatus.OK, description: "Pinned transaction page and footer.", type: AskDrillResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "The request or answer row is invalid." })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: "The answer context or current access is invalid." })
  @ApiResponse({ status: HttpStatus.GONE, description: "The signed answer context has expired." })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: "Pinned data is unavailable or no longer foots." })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, description: "The opening could not be audited." })
  async run(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Body() body: unknown,
  ): Promise<AskDrillResponse> {
    const parsed = askDrillSchema.safeParse(body);
    if (!parsed.success) {
      const missingContext = missingContextRequest(body);
      if (missingContext) return this.respond(await this.drills.run(user, sessionId, missingContext));
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"} invalid`));
    }
    return this.respond(await this.drills.run(user, sessionId, parsed.data));
  }

  private respond(outcome: Awaited<ReturnType<AskDrillService["run"]>>): AskDrillResponse {
    if ("response" in outcome) return outcome.response;
    throw new HttpException(outcome.message, outcome.status);
  }
}

function missingContextRequest(body: unknown): AskDrillRequestDto | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const request = body as Record<string, unknown>;
  if ("context" in request && (typeof request.context !== "string" || request.context.trim())) return null;
  if (typeof request.rowKey !== "string" || !request.rowKey.trim() || request.rowKey.length > 200) return null;
  if (!Number.isInteger(request.page) || (request.page as number) < 1 || (request.page as number) > 1_000_000) {
    return null;
  }
  return { context: "", rowKey: request.rowKey.trim(), page: request.page as number };
}
