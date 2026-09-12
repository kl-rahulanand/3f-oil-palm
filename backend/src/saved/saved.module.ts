import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ExplorationAuditFilter } from "../common/exploration-audit.filter";
import { SavedController } from "./saved.controller";
import { SavedService } from "./saved.service";

@Module({
  controllers: [SavedController],
  providers: [SavedService, AuthGuard, ExplorationAuditFilter],
})
export class SavedModule {}
