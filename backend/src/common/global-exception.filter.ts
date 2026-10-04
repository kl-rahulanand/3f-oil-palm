import { randomUUID } from "node:crypto";
import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { ErrorEnvelope, ErrorFieldDetail } from "@3f/contract";
import type { Response } from "express";
import type { Config } from "../config";
import {
  MEASURE_FILTER_INVALID_MESSAGES,
  MeasureFilterInvalidException,
} from "../semantic/measure-filter-invalid.exception";
import { PLANT_FILTER_INVALID_MESSAGES, PlantFilterInvalidException } from "../semantic/plant-filter-invalid.exception";
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
    const measureFilterError = exception instanceof MeasureFilterInvalidException ? exception : undefined;
    const plantFilterError = exception instanceof PlantFilterInvalidException ? exception : undefined;
    const typedFilterError = measureFilterError ?? plantFilterError;
    const statusCode = zodError
      ? HttpStatus.BAD_REQUEST
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorId = randomUUID();
    const stack = sanitizedStack(exception);
    // A 400 is a validation failure (Zod safeParse -> BadRequestException, or a raw ZodError).
    // Surface VALIDATION_ERROR with sanitized field names; never the client-supplied values.
    const validation =
      statusCode === HttpStatus.BAD_REQUEST && !typedFilterError
        ? zodError
          ? zodValidationDetails(zodError)
          : httpValidationDetails(exception)
        : undefined;
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
        userMessage: measureFilterError
          ? MEASURE_FILTER_INVALID_MESSAGES[measureFilterError.reason]
          : plantFilterError
            ? PLANT_FILTER_INVALID_MESSAGES[plantFilterError.reason](plantFilterError.plants)
            : validation
              ? "The request contains invalid fields"
              : statusCode >= 500
                ? "Something went wrong. Please try again later"
                : "The request could not be completed",
        details: measureFilterError
          ? { reason: measureFilterError.reason }
          : plantFilterError
            ? { reason: plantFilterError.reason }
            : validation
              ? { fieldErrors: validation }
              : {},
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

function httpValidationDetails(exception: unknown): ErrorFieldDetail[] {
  // A NestJS validation-style 400 may carry a string[] `message`; map only the field NAMES.
  // Any other 400 still counts as a validation failure with a generic field marker.
  const response = exception instanceof HttpException ? exception.getResponse() : undefined;
  const messages =
    typeof response === "object" && response !== null && "message" in response && Array.isArray(response.message)
      ? (response.message as unknown[])
      : [];
  const fieldErrors = messages
    .filter((message): message is string => typeof message === "string")
    .map((message) => ({
      field: message.match(/^([a-zA-Z][\w.-]{0,63})\s/)?.[1] ?? "request",
      reason: "invalid",
    }));
  return fieldErrors.length ? fieldErrors : [{ field: "request", reason: "invalid" }];
}

function zodValidationDetails(error: ZodLikeError): ErrorFieldDetail[] {
  const fieldErrors = error.issues.map((issue) => ({
    field: Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "request",
    reason: "invalid",
  }));
  return fieldErrors.length ? fieldErrors : [{ field: "request", reason: "invalid" }];
}
