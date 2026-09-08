import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { type Config, loadConfig } from "./config";

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

export function configureApp(app: INestApplication, cfg: Config = loadConfig()): void {
  app.enableCors({ origin: cfg.frontendOrigin, credentials: true });
  if (!cfg.swaggerEnabled) return;

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup("api/docs", app, document);
  console.log("Swagger docs at /api/docs");
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
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  configureApp(app, cfg);
  // Request validation is done per-route with zod (see controllers), so no global
  // class-validator ValidationPipe is needed.
  await listenForRequests(app, cfg);
  console.log(`3F backend listening on :${cfg.port} (LLM provider: ${cfg.llmProvider})`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error("Failed to start backend:", err);
    process.exit(1);
  });
}
