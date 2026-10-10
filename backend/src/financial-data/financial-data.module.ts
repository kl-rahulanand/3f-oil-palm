import { Module } from "@nestjs/common";
import { CoreModule } from "../core/core.module";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";

@Module({
  imports: [CoreModule],
  providers: [FinancialAccessService, FinancialDataService],
  exports: [FinancialDataService],
})
export class FinancialDataModule {}
