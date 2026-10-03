import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { HelpService } from "../help/help.service";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { ReportsService } from "../reports/reports.service";
import { MisModule } from "../mis/mis.module";
import { GlNameRepository } from "../warehouse/gl-name.repository";
import { ChatController } from "./chat.controller";
import { AskDrillController } from "./ask-drill.controller";
import { AskDrillContextService, createAskDrillContextFromEnvironment } from "./ask-drill-context";
import { AskDrillService } from "./ask-drill.service";
import { ChatService } from "./chat.service";
import { StatementGroundingService } from "./statement-grounding.service";
import { StatementExplanationService } from "./statement-explanation.service";

// CoreModule owns the single config-selected LLM binding. Its mock default only clarifies;
// deployments that should answer must set LLM_PROVIDER=bedrock and BEDROCK_MODEL_ID.
@Module({
  imports: [MisModule],
  controllers: [ChatController, AskDrillController],
  providers: [
    ChatService,
    StatementGroundingService,
    StatementExplanationService,
    HelpService,
    ReportsService,
    SelectionResolverService,
    AuthGuard,
    AskDrillService,
    GlNameRepository,
    {
      provide: AskDrillContextService,
      useFactory: createAskDrillContextFromEnvironment,
    },
  ],
  exports: [AskDrillContextService],
})
export class ChatModule {}
