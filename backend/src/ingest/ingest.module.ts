import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { IngestController } from "./ingest.controller";
import { IngestService } from "./ingest.service";

@Module({
  controllers: [IngestController],
  providers: [IngestService, AuthGuard],
})
export class IngestModule {}
