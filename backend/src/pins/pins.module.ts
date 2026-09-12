import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ExplorationAuditFilter } from "../common/exploration-audit.filter";
import { PinsController } from "./pins.controller";
import { PinsService } from "./pins.service";

@Module({
  controllers: [PinsController],
  providers: [PinsService, AuthGuard, ExplorationAuditFilter],
})
export class PinsModule {}
