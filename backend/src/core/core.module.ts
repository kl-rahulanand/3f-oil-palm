import { Global, Module } from "@nestjs/common";
import {
  ALARM_SINK,
  DRIZZLE_DB,
  LLM_PROVIDER,
  RECON_STORE,
  WAREHOUSE,
  loadConfig,
} from "../config";
import { createDb } from "../db/pool";
import { StarRocksAdapter } from "../warehouse/starrocks.adapter";
import { StarRocksMysqlAdapter } from "../warehouse/starrocks-mysql.adapter";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { MockLlmProvider } from "../llm/mock.provider";
import { BedrockLlmProvider } from "../llm/bedrock.provider";
import { RbacService } from "./rbac.service";
import { DimensionValuesService } from "./dimension-values.service";
import { SessionService } from "./session.service";
import { AuditService } from "./audit.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { LoggerAlarmSink } from "../recon/recon.alarm";
import { DrizzleReconStore } from "../recon/recon.store";
import { ReconciliationService } from "../recon/reconciliation.service";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { PinRefreshService } from "../pins/pin-refresh.service";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";

/** Global core: app DB + the two seams (warehouse, LLM) + shared services. */
@Global()
@Module({
  providers: [
    { provide: DRIZZLE_DB, useFactory: createDb },
    {
      provide: WAREHOUSE,
      useFactory: (): Warehouse =>
        loadConfig().warehouseDriver === "http" ? new StarRocksAdapter() : new StarRocksMysqlAdapter(),
    },
    {
      provide: LLM_PROVIDER,
      useFactory: () =>
        loadConfig().llmProvider === "bedrock" ? new BedrockLlmProvider() : new MockLlmProvider(),
    },
    RbacService,
    DimensionValuesService,
    SessionService,
    AuditService,
    { provide: RECON_STORE, useClass: DrizzleReconStore },
    { provide: ALARM_SINK, useClass: LoggerAlarmSink },
    ReconciliationService,
    SelectionExecutor,
    PinRefreshService,
    AuthoredMeasureRegistry,
    SemanticLayer,
    SqlBuilder,
    SqlValidator,
  ],
  exports: [
    DRIZZLE_DB,
    WAREHOUSE,
    LLM_PROVIDER,
    RbacService,
    DimensionValuesService,
    SessionService,
    AuditService,
    RECON_STORE,
    ALARM_SINK,
    ReconciliationService,
    SelectionExecutor,
    PinRefreshService,
    AuthoredMeasureRegistry,
    SemanticLayer,
    SqlBuilder,
    SqlValidator,
  ],
})
export class CoreModule {}
