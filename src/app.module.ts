import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { loadConfig } from "./config.js";
import { AppConfigModule } from "./appConfig.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { PollingModule } from "./polling/polling.module.js";
import { ApiModule } from "./api/api.module.js";

// BullModule.forRoot() takes a plain object, not an async factory, so the
// Redis connection needs config synchronously here at bootstrap. This is
// separate from (and in addition to) AppConfigModule, which provides the
// same values through DI for everything else. loadConfig() is a cheap,
// pure env read + zod parse, so calling it twice costs nothing real and
// keeps both call sites simple.
const bootConfig = loadConfig();

@Module({
  imports: [
    AppConfigModule,
    BullModule.forRoot({
      connection: { host: bootConfig.REDIS_HOST, port: bootConfig.REDIS_PORT },
    }),
    DatabaseModule,
    PollingModule,
    ApiModule,
  ],
})
export class AppModule {}
