import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DatabaseModule } from "../db/db.module.js";
import { POLL_QUEUE_NAME } from "./constants.js";
import { SchedulerService } from "./scheduler.service.js";
import { PollProcessor } from "./pollProcessor.js";

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: POLL_QUEUE_NAME })],
  providers: [SchedulerService, PollProcessor],
  exports: [SchedulerService],
})
export class PollingModule {}
