import { Global, Module } from "@nestjs/common";
import { loadConfig } from "./config.js";
import { APP_CONFIG } from "./tokens.js";

/**
 * @Global() so APP_CONFIG is injectable from any module in the app without
 * every module having to explicitly import this one — DatabaseModule's
 * pool factory and PollProcessor both need it, and neither is a natural
 * importer of "the app module."
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useValue: loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
