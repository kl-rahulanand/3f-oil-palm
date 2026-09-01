import { Module } from "@nestjs/common";
import { AdminGuard, AuthGuard } from "../auth/auth.guard";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

@Module({
  controllers: [UsageController],
  providers: [UsageService, AuthGuard, AdminGuard],
})
export class UsageModule {}
