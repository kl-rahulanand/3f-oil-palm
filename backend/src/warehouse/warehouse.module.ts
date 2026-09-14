import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { FreshnessController } from "./freshness.controller";
import { FreshnessService } from "./freshness.service";

@Module({
  controllers: [FreshnessController],
  providers: [FreshnessService, AuthGuard],
})
export class WarehouseModule {}
