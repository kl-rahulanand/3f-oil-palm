import { randomUUID } from "node:crypto";
import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { ErrorEnvelope, ErrorFieldDetail } from "@3f/contract";
import type { Response } from "express";
import type { Config } from "../config";
import { maskPath, type ObservableRequest } from "./request-logging.middleware";
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
    const zodError = asZodError(exception);
    const statusCode = zodError
      ? HttpStatus.BAD_REQUEST
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorId = randomUUID();
    const stack = sanitizedStack(exception);
    const validation = zodError ? zodValidationDetails(zodError) : undefined;
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
        path: maskPath(request),
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
        type: zodError
          ? "ValidationError"
          : exception instanceof HttpException
            ? exception.constructor.name
            : "InternalError",
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

interface ZodLikeIssue {
  path?: Array<string | number>;
}
interface ZodLikeError {
  name: string;
  issues: ZodLikeIssue[];
}

// The app validates with Zod (safeParse), not class-validator. A ZodError reaching the filter is a
// validation failure; map its issues to sanitized field errors. Only issue PATHS (field names) are
// surfaced — never the client-supplied values or messages.
function asZodError(exception: unknown): ZodLikeError | undefined {
  if (
    typeof exception === "object" &&
    exception !== null &&
    (exception as { name?: unknown }).name === "ZodError" &&
    Array.isArray((exception as { issues?: unknown }).issues)
  ) {
    return exception as ZodLikeError;
  }
  return undefined;
}

function zodValidationDetails(error: ZodLikeError): ErrorFieldDetail[] {
  const fieldErrors = error.issues.map((issue) => ({
    field: Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "request",
    reason: "invalid",
  }));
  return fieldErrors.length ? fieldErrors : [{ field: "request", reason: "invalid" }];
}
