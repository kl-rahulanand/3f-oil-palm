import type { Environment } from "@3f/contract";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface StructuredLogRecord {
  timestampUtc: string;
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  environment: Environment;
  serviceName: string;
  module: string;
  correlationId: string | null;
  accountId: string | null;
  requestId: string | null;
}

export type LogTransport = (record: StructuredLogRecord) => void;

export interface LogFields {
  module: string;
  context?: Record<string, unknown>;
  correlationId?: string | null;
  accountId?: string | null;
  requestId?: string | null;
}

export class StructuredLogger {
  constructor(
    private readonly config: { environment: Environment; serviceName: string },
    private readonly transport: LogTransport = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
  ) {}

  log(level: LogLevel, message: string, fields: LogFields): void {
    this.transport({
      timestampUtc: new Date().toISOString(),
      level,
      message,
      context: fields.context ?? {},
      environment: this.config.environment,
      serviceName: this.config.serviceName,
      module: fields.module,
      correlationId: fields.correlationId ?? null,
      accountId: fields.accountId ?? null,
      requestId: fields.requestId ?? null,
    });
  }
}

export function sanitizedStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  // Keep ONLY the trusted call-site frames ("    at ..."). Message lines can carry
  // provider output, credentials, or PII, so they are dropped rather than merely
  // skipping the first line.
  // Real V8 frames end in ":line:col" (optionally ")"). Requiring that shape stops a
  // multiline error message from masquerading as a frame and leaking through.
  const frames = error.stack.split("\n").filter((line) => /^\s+at\s.+:\d+:\d+\)?\s*$/.test(line));
  return frames.length ? frames.join("\n") : undefined;
}
