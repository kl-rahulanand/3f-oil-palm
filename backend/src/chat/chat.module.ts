import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { HelpService } from "../help/help.service";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { ReportsService } from "../reports/reports.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

// CoreModule owns the single config-selected LLM binding. Its mock default only clarifies;
// deployments that should answer must set LLM_PROVIDER=bedrock and BEDROCK_MODEL_ID.
@Module({
  controllers: [ChatController],
  providers: [ChatService, HelpService, ReportsService, SelectionResolverService, AuthGuard],
})
export class ChatModule {}
