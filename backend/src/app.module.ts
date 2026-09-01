import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CoreModule } from "./core/core.module";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard, AdminGuard } from "./auth/auth.guard";
import { CsrfGuard } from "./auth/csrf.guard";
import { UsersController } from "./users/users.controller";
import { GrantsController } from "./grants/grants.controller";
import { ChatController } from "./chat/chat.controller";
import { ChatService } from "./chat/chat.service";
import { LoginRateLimitService } from "./auth/rate-limit.service";
import { SavedController } from "./saved/saved.controller";
import { SavedService } from "./saved/saved.service";
import { PinsController } from "./pins/pins.controller";
import { PinsService } from "./pins/pins.service";
import { ReportsController } from "./reports/reports.controller";
import { ReportsService } from "./reports/reports.service";
import { AdminModule } from "./admin/admin.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { UsageModule } from "./usage/usage.module";
import { MeasuresModule } from "./measures/measures.module";
import { HelpModule } from "./help/help.module";

@Module({
  imports: [CoreModule, AdminModule, ConversationsModule, UsageModule, MeasuresModule, HelpModule],
  controllers: [
    AuthController,
    UsersController,
    GrantsController,
    ChatController,
    SavedController,
    PinsController,
    ReportsController,
  ],
  providers: [
    ChatService,
    SavedService,
    PinsService,
    ReportsService,
    AuthGuard,
    AdminGuard,
    LoginRateLimitService,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
