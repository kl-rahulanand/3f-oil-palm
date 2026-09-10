import { Module } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { MisSelectionController } from "./mis-selection.controller";
import { MisSelectionService } from "./mis-selection.service";

@Module({
  controllers: [MisSelectionController],
  providers: [MisSelectionService, SelectionResolverService, AuthGuard],
})
export class MisSelectionModule {}
