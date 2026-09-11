import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import { MisStatementController } from "./mis-statement.controller";
import { MisStatementService } from "./mis-statement.service";

@Module({
  controllers: [MisStatementController],
  providers: [MisStatementService, SelectionResolverService, StatementOutlineRepository, AuthGuard],
})
export class MisModule {}
