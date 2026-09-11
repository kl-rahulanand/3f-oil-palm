import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import { MisStatementExportService } from "./mis-statement-export.service";
import { MisStatementController } from "./mis-statement.controller";
import { MisStatementService } from "./mis-statement.service";

@Module({
  controllers: [MisStatementController],
  providers: [
    MisStatementService,
    MisStatementExportService,
    SelectionResolverService,
    StatementOutlineRepository,
    AuthGuard,
  ],
})
export class MisModule {}
