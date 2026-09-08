import { randomUUID } from "node:crypto";
import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { ErrorEnvelope, ErrorFieldDetail } from "@3f/contract";
import type { Response } from "express";
import type { Config } from "../config";
import type { ObservableRequest } from "./request-logging.middleware";
import { sanitizedStack, StructuredLogger } from "./structured.logger";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly config: Pick<Config, "environment">,
    private readonly logger: StructuredLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ObservableRequest>();
    const response = http.getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorId = randomUUID();
    const stack = sanitizedStack(exception);
    const validation = validationDetails(exception, statusCode);
    const message = statusCode >= 500 ? "Unhandled server error" : "HTTP exception";
    const correlationId = request.correlationId ?? randomUUID();
    const requestId = request.requestId ?? null;

    this.logger.log(statusCode >= 500 ? "error" : "debug", message, {
      module: "HTTP",
      correlationId,
      accountId: request.authUser?.id ?? null,
      requestId,
      context: {
        errorId,
        method: request.method,
        path: request.path,
        statusCode,
        ...(stack ? { stack } : {}),
      },
    });

    const envelope: ErrorEnvelope = {
      success: false,
      data: null,
      error: {
        errorId,
        code: validation
          ? "VALIDATION_ERROR"
          : exception instanceof HttpException
            ? `HTTP_${statusCode}`
            : "INTERNAL_ERROR",
        type: exception instanceof HttpException ? exception.constructor.name : "InternalError",
        message,
        userMessage: validation
          ? "The request contains invalid fields"
          : statusCode >= 500
            ? "Something went wrong. Please try again later"
            : "The request could not be completed",
        details: validation ? { fieldErrors: validation } : {},
        statusCode,
        correlationId,
        requestId,
        environment: this.config.environment,
        timestampUtc: new Date().toISOString(),
        ...(this.config.environment === "Local" && stack ? { stack } : {}),
      },
    };

    response.status(statusCode).json(envelope);
  }
}

function validationDetails(exception: unknown, statusCode: number): ErrorFieldDetail[] | undefined {
  if (!(exception instanceof HttpException) || statusCode !== HttpStatus.BAD_REQUEST) return undefined;
  const response = exception.getResponse();
  const messages =
    typeof response === "object" && response !== null && "message" in response
      ? Array.isArray(response.message)
        ? response.message
        : [response.message]
      : [];
  const fieldErrors = messages
    .filter((message): message is string => typeof message === "string")
    .map((message) => ({
      field: message.match(/^([a-zA-Z][\w.-]{0,63})\s/)?.[1] ?? "request",
      reason: "invalid",
    }));
  return fieldErrors.length ? fieldErrors : [{ field: "request", reason: "invalid" }];
}
