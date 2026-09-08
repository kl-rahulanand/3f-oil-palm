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
  // error.stack is "<name>: <message>\n    at ...". The message may be multiline and
  // attacker/provider-influenced, so strip exactly that header before keeping call-site frames;
  // if the header cannot be identified, omit the stack rather than risk leaking message content.
  const header = `${error.name}: ${error.message}`;
  if (!error.stack.startsWith(header)) return undefined;
  const frames = error.stack
    .slice(header.length)
    .split("\n")
    .filter((line) => /^\s+at\s.+:\d+:\d+\)?\s*$/.test(line));
  return frames.length ? frames.join("\n") : undefined;
}
