import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { APP_CONFIG, DIFFS_REPO, POLL_FAILURES_REPO, SNAPSHOTS_REPO, WATCHED_SERVERS_REPO } from "../tokens.js";
import type { WatchedServersRepo } from "../db/watchedServers.repo.js";
import type { SnapshotsRepo } from "../db/snapshots.repo.js";
import type { DiffsRepo } from "../db/diffs.repo.js";
import type { PollFailuresRepo } from "../db/pollFailures.repo.js";
import type { AppConfig } from "../config.js";
import { pollServerTools } from "../mcp/pollServer.js";
import { sendSlackAlert } from "../alerts/slackAlert.js";
import { pollAndRecordServer } from "./pollAndRecordServer.js";
import { POLL_QUEUE_NAME } from "./constants.js";

interface PollJobData {
  serverId: number;
}

@Processor(POLL_QUEUE_NAME)
export class PollProcessor extends WorkerHost {
  private readonly logger = new Logger(PollProcessor.name);

  constructor(
    @Inject(WATCHED_SERVERS_REPO) private readonly watchedServers: WatchedServersRepo,
    @Inject(SNAPSHOTS_REPO) private readonly snapshots: SnapshotsRepo,
    @Inject(DIFFS_REPO) private readonly diffs: DiffsRepo,
    @Inject(POLL_FAILURES_REPO) private readonly pollFailures: PollFailuresRepo,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {
    super();
  }

  async process(job: Job<PollJobData>): Promise<void> {
    const server = await this.watchedServers.findById(job.data.serverId);
    if (!server) {
      this.logger.warn(`Skipping poll for server id=${job.data.serverId}: no longer exists.`);
      return;
    }
    if (!server.enabled) {
      this.logger.debug(`Skipping poll for "${server.name}": disabled.`);
      return;
    }

    const outcome = await pollAndRecordServer(server, {
      poll: pollServerTools,
      snapshots: this.snapshots,
      diffs: this.diffs,
      pollFailures: this.pollFailures,
      onBreakingChanges: async (srv, breaking) => {
        const webhookUrl = server.slackWebhookUrl ?? this.config.SLACK_WEBHOOK_URL;
        if (!webhookUrl) return;
        try {
          await sendSlackAlert(webhookUrl, srv, breaking);
        } catch (err) {
          this.logger.error(`Slack alert failed for "${srv.name}": ${err instanceof Error ? err.message : err}`);
        }
      },
    });

    switch (outcome.status) {
      case "changed":
        this.logger.log(
          `"${server.name}": ${outcome.changes.length} change(s), ${outcome.breakingCount} breaking.`
        );
        break;
      case "first-snapshot":
        this.logger.log(`"${server.name}": captured first snapshot.`);
        break;
      case "failed":
        this.logger.warn(`"${server.name}": poll failed — ${outcome.error}`);
        break;
      case "unchanged":
        this.logger.debug(`"${server.name}": no change.`);
        break;
    }
  }
}
