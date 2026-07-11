import { Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import type { Pool } from "pg";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";
import { WatchedServersRepo } from "./watchedServers.repo.js";
import { SnapshotsRepo } from "./snapshots.repo.js";
import { DiffsRepo } from "./diffs.repo.js";
import { PollFailuresRepo } from "./pollFailures.repo.js";
import { APP_CONFIG, DIFFS_REPO, PG_POOL, POLL_FAILURES_REPO, SNAPSHOTS_REPO, WATCHED_SERVERS_REPO } from "../tokens.js";
import type { AppConfig } from "../config.js";

@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (config: AppConfig) => createPool(config.DATABASE_URL),
      inject: [APP_CONFIG],
    },
    { provide: WATCHED_SERVERS_REPO, useFactory: (pool: Pool) => new WatchedServersRepo(pool), inject: [PG_POOL] },
    { provide: SNAPSHOTS_REPO, useFactory: (pool: Pool) => new SnapshotsRepo(pool), inject: [PG_POOL] },
    { provide: DIFFS_REPO, useFactory: (pool: Pool) => new DiffsRepo(pool), inject: [PG_POOL] },
    { provide: POLL_FAILURES_REPO, useFactory: (pool: Pool) => new PollFailuresRepo(pool), inject: [PG_POOL] },
  ],
  exports: [PG_POOL, WATCHED_SERVERS_REPO, SNAPSHOTS_REPO, DIFFS_REPO, POLL_FAILURES_REPO],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export async function migrateOnBoot(pool: Pool): Promise<void> {
  await runMigrations(pool);
}
