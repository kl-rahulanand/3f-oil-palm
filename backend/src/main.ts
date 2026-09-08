import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { requestLogging } from "./common/request-logging.middleware";
import { sanitizedStack, StructuredLogger } from "./common/structured.logger";
import { type Config, loadConfig, mapEnvironment } from "./config";

export const API_VERSION = "0.1.0";

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle("3F API")
    .setDescription(
      "NL-to-data chatbot API - the backend security boundary. Protected endpoints require JWT session cookies.",
    )
    .setVersion(API_VERSION)
    .build();
}

export function configureApp(
  app: INestApplication,
  cfg: Config = loadConfig(),
  logger: StructuredLogger = new StructuredLogger(cfg),
): void {
  // requestLogging BEFORE enableCors: a CORS preflight is answered by the CORS middleware and
  // short-circuits, so logging must run first for every request (preflight included) to be
  // correlated and recorded.
  app.use(requestLogging(logger));
  app.enableCors({ origin: cfg.frontendOrigin, credentials: true });
  app.useGlobalFilters(new GlobalExceptionFilter(cfg, logger));
  if (!cfg.swaggerEnabled) return;

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup("api/docs", app, document);
  logger.log("info", "Swagger documentation enabled", {
    module: "Bootstrap",
    context: { path: "/api/docs" },
  });
}

type AppListener = (app: INestApplication, port: number, host?: string) => Promise<unknown>;

export async function listenForRequests(
  app: INestApplication,
  cfg: Pick<Config, "port" | "authOtpMock">,
  listen: AppListener = (target, port, host) => (host ? target.listen(port, host) : target.listen(port)),
): Promise<void> {
  await listen(app, cfg.port, cfg.authOtpMock ? "127.0.0.1" : undefined);
}

async function bootstrap() {
  const cfg = loadConfig();
  const logger = new StructuredLogger(cfg);
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  configureApp(app, cfg, logger);
  // Request validation is done per-route with zod (see controllers), so no global
  // class-validator ValidationPipe is needed.
  await listenForRequests(app, cfg);
  logger.log("info", "Backend listening", {
    module: "Bootstrap",
    context: { port: cfg.port, llmProvider: cfg.llmProvider },
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    new StructuredLogger({
      environment: mapEnvironment(process.env.ENVIRONMENT || process.env.NODE_ENV),
      serviceName: process.env.SERVICE_NAME?.trim() || "3f-backend",
    }).log("fatal", "Backend startup failed", {
      module: "Bootstrap",
      context: { stack: sanitizedStack(err) },
    });
    // Set exitCode instead of process.exit so the fatal record flushes to a piped stdout before the
    // process ends (a failed bootstrap keeps nothing alive, so the event loop drains and exits).
    process.exitCode = 1;
  });
}
