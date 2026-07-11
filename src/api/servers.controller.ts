import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { DIFFS_REPO, WATCHED_SERVERS_REPO } from "../tokens.js";
import type { WatchedServersRepo } from "../db/watchedServers.repo.js";
import type { DiffsRepo } from "../db/diffs.repo.js";
import { SchedulerService } from "../polling/scheduler.service.js";
import { ZodValidationPipe } from "./zodValidation.pipe.js";
import {
  type CreateWatchedServerBody,
  createWatchedServerSchema,
  type SetEnabledBody,
  setEnabledSchema,
} from "./servers.dto.js";

@Controller("servers")
export class ServersController {
  constructor(
    @Inject(WATCHED_SERVERS_REPO) private readonly watchedServers: WatchedServersRepo,
    @Inject(DIFFS_REPO) private readonly diffs: DiffsRepo,
    private readonly scheduler: SchedulerService
  ) {}

  @Get()
  async list() {
    return this.watchedServers.list();
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createWatchedServerSchema)) body: CreateWatchedServerBody) {
    const server = await this.watchedServers.create(body);
    await this.scheduler.scheduleServer(server.id, server.pollIntervalMs);
    return server;
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const server = await this.watchedServers.findById(id);
    if (!server) throw new NotFoundException(`No watched server with id ${id}.`);
    return server;
  }

  @Patch(":id/enabled")
  async setEnabled(
    @Param("id", ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(setEnabledSchema)) body: SetEnabledBody
  ) {
    const server = await this.watchedServers.findById(id);
    if (!server) throw new NotFoundException(`No watched server with id ${id}.`);

    await this.watchedServers.setEnabled(id, body.enabled);
    if (body.enabled) {
      await this.scheduler.scheduleServer(id, server.pollIntervalMs);
    } else {
      await this.scheduler.unscheduleServer(id);
    }
    return { id, enabled: body.enabled };
  }

  @Post(":id/poll-now")
  async pollNow(@Param("id", ParseIntPipe) id: number) {
    const server = await this.watchedServers.findById(id);
    if (!server) throw new NotFoundException(`No watched server with id ${id}.`);
    await this.scheduler.pollNow(id);
    return { queued: true };
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) {
    const server = await this.watchedServers.findById(id);
    if (!server) throw new NotFoundException(`No watched server with id ${id}.`);
    await this.scheduler.unscheduleServer(id);
    await this.watchedServers.delete(id);
    return { deleted: true };
  }

  @Get(":id/diffs")
  async diffHistory(@Param("id", ParseIntPipe) id: number) {
    const server = await this.watchedServers.findById(id);
    if (!server) throw new NotFoundException(`No watched server with id ${id}.`);
    return this.diffs.listForServer(id);
  }
}
