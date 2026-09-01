import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, AuthGuard],
  exports: [ConversationsService],
})
export class ConversationsModule {}
