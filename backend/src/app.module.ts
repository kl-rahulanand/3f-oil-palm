import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { CsrfGuard } from "./auth/csrf.guard";
import { LoginRateLimitService } from "./auth/rate-limit.service";
import { CoreModule } from "./core/core.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [CoreModule, HealthModule],
  controllers: [AuthController],
  providers: [AuthGuard, LoginRateLimitService, { provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
