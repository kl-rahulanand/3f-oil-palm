import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { AuthedRequest } from "../auth/auth.guard";
import { loadConfig } from "../config";
import { AuditService, type ExplorationAction, type ExplorationResource } from "../core/audit.service";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { StructuredLogger } from "./structured.logger";

@Catch()
export class ExplorationAuditFilter implements ExceptionFilter {
  private readonly fallback: GlobalExceptionFilter;

  constructor(private readonly audit: AuditService) {
    const config = loadConfig();
    this.fallback = new GlobalExceptionFilter(config, new StructuredLogger(config));
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<AuthedRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (request.authUser && status >= 400 && status < 500) {
      try {
        const routePath = String(request.route?.path ?? "");
        await this.audit.writeExplorationRefusalEvent({
          actorId: request.authUser.id,
          sessionId: request.sessionId ?? "",
          resource: explorationResource(routePath),
          action: explorationAction(request.method, routePath),
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

function explorationResource(routePath: string): ExplorationResource {
  if (routePath.startsWith("/api/pins")) return "pins";
  if (routePath.startsWith("/api/saved")) return "saved";
  throw new Error("Exploration route could not be identified for refusal audit");
}

function explorationAction(method: string, url: string): ExplorationAction {
  if (method === "GET") return "list";
  if (method === "POST") return "create";
  if (method === "DELETE") return "delete";
  return url.endsWith("/reorder") ? "reorder" : "update_view";
}
