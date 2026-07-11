import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

async function bootstrap() {
  const logger = new Logger("bootstrap");
  const config = loadConfig();

  logger.log("Running migrations...");
  const migrationPool = createPool(config.DATABASE_URL);
  try {
    await runMigrations(migrationPool);
  } finally {
    await migrationPool.end();
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(config.PORT);
  logger.log(`Listening on port ${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  process.exitCode = 1;
});
