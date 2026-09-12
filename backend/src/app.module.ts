import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { CsrfGuard } from "./auth/csrf.guard";
import { LoginRateLimitService } from "./auth/rate-limit.service";
import { ChatModule } from "./chat/chat.module";
import { CoreModule } from "./core/core.module";
import { HealthModule } from "./health/health.module";
import { IngestModule } from "./ingest/ingest.module";
import { MisSelectionModule } from "./mis/mis-selection.module";
import { MisModule } from "./mis/mis.module";

@Module({
  imports: [CoreModule, HealthModule, IngestModule, MisSelectionModule, MisModule, ChatModule],
  controllers: [AuthController],
  providers: [AuthGuard, LoginRateLimitService, { provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
