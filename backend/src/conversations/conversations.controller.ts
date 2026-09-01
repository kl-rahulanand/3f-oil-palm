import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type {
  AuthUser,
  ConversationDetail,
  ConversationSummary,
  CreateConversationRequest,
  RenameConversationRequest,
} from "@pulse/contract";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { zodApiBody } from "../common/openapi";
import {
  createConversationSchema,
  renameConversationSchema,
} from "./conversations.schemas";
import { ConversationsService } from "./conversations.service";

@ApiTags("conversations")
@Controller("api/conversations")
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's conversations" })
  @ApiResponse({ status: HttpStatus.OK, description: "Conversations listed" })
  list(@CurrentUser() user: AuthUser): Promise<ConversationSummary[]> {
    return this.conversations.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: "Create a conversation for the current user" })
  @ApiBody(zodApiBody(createConversationSchema))
  @ApiResponse({ status: HttpStatus.CREATED, description: "Conversation created" })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateConversationRequest,
  ): Promise<ConversationSummary> {
    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.conversations.create(user.id, parsed.data.title);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one of the current user's conversations and its turns" })
  @ApiParam({ name: "id", description: "Conversation id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Conversation returned" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Conversation not found" })
  get(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<ConversationDetail> {
    assertUuid(id);
    return this.conversations.getForUser(user.id, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename one of the current user's conversations" })
  @ApiParam({ name: "id", description: "Conversation id" })
  @ApiBody(zodApiBody(renameConversationSchema))
  @ApiResponse({ status: HttpStatus.OK, description: "Conversation renamed" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Conversation not found" })
  rename(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: RenameConversationRequest,
  ): Promise<ConversationSummary> {
    assertUuid(id);
    const parsed = renameConversationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.conversations.rename(user.id, id, parsed.data.title);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete one of the current user's conversations" })
  @ApiParam({ name: "id", description: "Conversation id" })
  @ApiResponse({ status: HttpStatus.OK, description: "Conversation deleted" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Conversation not found" })
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    assertUuid(id);
    return this.conversations.remove(user.id, id);
  }
}

function assertUuid(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new NotFoundException("Conversation not found");
  }
}
