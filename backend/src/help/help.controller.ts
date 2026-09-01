import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AuthUser, HelpResponse } from "@pulse/contract";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { HelpService } from "./help.service";

@Controller("api/help")
@UseGuards(AuthGuard)
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Get()
  getHelp(@CurrentUser() user: AuthUser): Promise<HelpResponse> {
    return this.help.build(user);
  }
}
