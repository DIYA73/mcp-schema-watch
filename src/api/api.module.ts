import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/db.module.js";
import { PollingModule } from "../polling/polling.module.js";
import { ServersController } from "./servers.controller.js";

@Module({
  imports: [DatabaseModule, PollingModule],
  controllers: [ServersController],
})
export class ApiModule {}
