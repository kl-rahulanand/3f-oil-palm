import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import { DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import { MisDrillAuditFilter } from "./mis-drill.audit.filter";
import { MisDrillController } from "./mis-drill.controller";
import { MisDrillService } from "./mis-drill.service";
import { MisStatementExportService } from "./mis-statement-export.service";
import { MisStatementController } from "./mis-statement.controller";
import { MisStatementService } from "./mis-statement.service";
import { StatementAttestationService, createStatementAttestationFromEnvironment } from "./statement-attestation";

@Module({
  controllers: [MisStatementController, MisDrillController],
  providers: [
    MisStatementService,
    MisStatementExportService,
    SelectionResolverService,
    StatementOutlineRepository,
    DrillTransactionsRepository,
    MisDrillService,
    MisDrillAuditFilter,
    {
      provide: StatementAttestationService,
      useFactory: createStatementAttestationFromEnvironment,
    },
    AuthGuard,
  ],
  exports: [
    StatementAttestationService,
    SelectionResolverService,
    StatementOutlineRepository,
    DrillTransactionsRepository,
  ],
})
export class MisModule {}
