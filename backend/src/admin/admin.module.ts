import { Module } from "@nestjs/common";
import { AdminGuard, AuthGuard } from "../auth/auth.guard";
import { AccessMetadataController } from "./access-metadata.controller";
import { AccessMetadataService } from "./access-metadata.service";

@Module({
  controllers: [AccessMetadataController],
  providers: [AccessMetadataService, AuthGuard, AdminGuard],
})
export class AdminModule {}
