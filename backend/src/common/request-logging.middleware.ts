import { randomUUID } from "node:crypto";
import type { AuthUser } from "@3f/contract";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { StructuredLogger } from "./structured.logger";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ObservableRequest extends Request {
  correlationId?: string;
  requestId?: string | null;
  authUser?: AuthUser;
}

export function requestLogging(logger: StructuredLogger): RequestHandler {
  return (req: ObservableRequest, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    const inboundCorrelationId = firstHeader(req.headers["x-correlation-id"]);
    req.correlationId =
      inboundCorrelationId && UUID_PATTERN.test(inboundCorrelationId) ? inboundCorrelationId : randomUUID();
    req.requestId = firstHeader(req.headers["x-request-id"]) ?? null;
    res.setHeader("x-correlation-id", req.correlationId);

    res.once("finish", () => {
      logger.log("info", "HTTP request completed", {
        module: "HTTP",
        correlationId: req.correlationId,
        accountId: req.authUser?.id ?? null,
        requestId: req.requestId,
        context: {
          method: req.method,
          path: maskPath(req.path),
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
      });
    });

    next();
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path segments are client-controlled and can carry account ids, emails, or tokens (constitution
// 05 requires context values be PII-masked). Redact id-shaped segments while keeping the structure.
function maskPath(path: string): string {
  return path
    .split("/")
    .map((seg) =>
      seg && (seg.includes("@") || UUID_SEGMENT.test(seg) || /^\d+$/.test(seg) || /^[0-9a-f]{16,}$/i.test(seg))
        ? ":masked"
        : seg,
    )
    .join("/");
}
