import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { WATCHED_SERVERS_REPO } from "../tokens.js";
import type { WatchedServersRepo } from "../db/watchedServers.repo.js";
import { POLL_QUEUE_NAME } from "./constants.js";

interface PollJobData {
  serverId: number;
}

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(POLL_QUEUE_NAME) private readonly queue: Queue<PollJobData>,
    @Inject(WATCHED_SERVERS_REPO) private readonly watchedServers: WatchedServersRepo
  ) {}

  /** On boot, (re)schedule a repeatable job for every currently-enabled server. */
  async onApplicationBootstrap(): Promise<void> {
    const servers = await this.watchedServers.listEnabled();
    for (const server of servers) {
      await this.scheduleServer(server.id, server.pollIntervalMs);
    }
    this.logger.log(`Scheduled polling for ${servers.length} enabled server(s).`);
  }

  /**
   * Adds or replaces the repeatable job for a server. A stable jobId per
   * server means calling this again (e.g. after the interval changes)
   * safely replaces the previous schedule instead of stacking a second one.
   */
  async scheduleServer(serverId: number, pollIntervalMs: number): Promise<void> {
    await this.unscheduleServer(serverId);
    await this.queue.add(
      "poll-server",
      { serverId },
      {
        jobId: `poll-server-${serverId}`,
        repeat: { every: pollIntervalMs },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      }
    );
  }

  /** Removes the repeatable schedule for a server (e.g. on disable/delete). */
  async unscheduleServer(serverId: number): Promise<void> {
    // The jobId is deterministic (set at creation in scheduleServer), so we
    // can remove it directly — removeJobScheduler takes that original id,
    // not the compound `.key` string that getJobSchedulers() returns.
    await this.queue.removeJobScheduler(`poll-server-${serverId}`);
  }

  /** Enqueues an immediate one-off poll, independent of the schedule — used by the "poll now" API endpoint. */
  async pollNow(serverId: number): Promise<void> {
    await this.queue.add("poll-server", { serverId }, { removeOnComplete: true, removeOnFail: true });
  }
}
