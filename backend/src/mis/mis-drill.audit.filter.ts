import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { AuthedRequest } from "../auth/auth.guard";
import { GlobalExceptionFilter } from "../common/global-exception.filter";
import { StructuredLogger } from "../common/structured.logger";
import { loadConfig } from "../config";
import { AuditService } from "../core/audit.service";
import { AuditedDrillRefusalException } from "./mis-drill.interface";

@Catch()
export class MisDrillAuditFilter implements ExceptionFilter {
  private readonly fallback: GlobalExceptionFilter;

  constructor(private readonly audit: AuditService) {
    const config = loadConfig();
    this.fallback = new GlobalExceptionFilter(config, new StructuredLogger(config));
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<AuthedRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (request.authUser && status >= 400 && status < 500 && !(exception instanceof AuditedDrillRefusalException)) {
      try {
        await this.audit.writeDrillRefusalEvent({
          actorId: request.authUser.id,
          sessionId: request.sessionId ?? "",
          submitted: request.body,
        });
      } catch (auditError) {
        this.fallback.catch(auditError, host);
        return;
      }
    }
    this.fallback.catch(exception, host);
  }
}
