import { Module } from "@nestjs/common";
import { AuthGuard, DbaGuard } from "../auth/auth.guard";
import { MeasuresController } from "./measures.controller";
import { MeasuresService } from "./measures.service";

@Module({
  controllers: [MeasuresController],
  providers: [MeasuresService, AuthGuard, DbaGuard],
})
export class MeasuresModule {}

