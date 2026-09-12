import { BadRequestException, Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AskRequest, AskResponse, AuthUser } from "@3f/contract";
import type { Response } from "express";
import { zodApiBody } from "../common/openapi";
import { AuthGuard, CurrentUser, RequireAction, SessionId } from "../auth/auth.guard";
import { ChatService } from "./chat.service";
import { CHAT_API_DESCRIPTIONS } from "./chat.constants";
import { askSchema } from "./chat.schemas";
import { runChatStream, serializeSseFrame } from "./chat.sse";

@ApiTags("chat")
@Controller("api/chat")
@UseGuards(AuthGuard, RequireAction("report"))
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @ApiOperation({ summary: "Ask a natural-language data question" })
  @ApiBody(zodApiBody(askSchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: CHAT_API_DESCRIPTIONS.answerGenerated })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: CHAT_API_DESCRIPTIONS.invalidRequestBody })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: CHAT_API_DESCRIPTIONS.unauthenticatedRequest,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: CHAT_API_DESCRIPTIONS.passwordResetRequired,
  })
  ask(@CurrentUser() user: AuthUser, @SessionId() sessionId: string, @Body() body: AskRequest): Promise<AskResponse> {
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.chat.ask(
      user,
      sessionId,
      parsed.data.question,
      parsed.data.selection,
      parsed.data.conversationId,
      parsed.data.turnId,
      parsed.data.reportGrounding,
      parsed.data.priorTurns,
    );
  }

  @Post("stream")
  @ApiOperation({ summary: "Stream a natural-language data answer" })
  @ApiBody(zodApiBody(askSchema))
  @ApiResponse({ status: HttpStatus.OK, description: "Answer streamed as server-sent events" })
  async stream(
    @CurrentUser() user: AuthUser,
    @SessionId() sessionId: string,
    @Body() body: AskRequest,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);

    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    try {
      await runChatStream(
        (onEvent) =>
          this.chat.ask(
            user,
            sessionId,
            parsed.data.question,
            parsed.data.selection,
            parsed.data.conversationId,
            parsed.data.turnId,
            parsed.data.reportGrounding,
            parsed.data.priorTurns,
            onEvent,
          ),
        (event) => response.write(serializeSseFrame(event)),
      );
    } finally {
      response.end();
    }
  }
}
