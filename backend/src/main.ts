import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";

export const API_VERSION = "0.1.0";

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle("Pulse API")
    .setDescription(
      "NL-to-data chatbot API - the backend security boundary. Protected endpoints require JWT session cookies.",
    )
    .setVersion(API_VERSION)
    .build();
}

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ["log", "error", "warn"] });
  app.enableCors({ origin: cfg.frontendOrigin, credentials: true });
  // Request validation is done per-route with zod (see controllers), so no global
  // class-validator ValidationPipe is needed.
  if (cfg.swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup("api/docs", app, document);
    // eslint-disable-next-line no-console
    console.log("Swagger docs at /api/docs");
  }
  await app.listen(cfg.port);
  // eslint-disable-next-line no-console
  console.log(`Pulse backend listening on :${cfg.port} (LLM provider: ${cfg.llmProvider})`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start backend:", err);
    process.exit(1);
  });
}
