import { inject, injectable } from '@needle-di/core';
import { ApplicationController } from './application.controller';
import { ConfigService } from './common/configs/config.service';
import { AuditCleanupJob } from './jobs/audit-cleanup.job';
import { StorageService } from './storage/storage.service';

@injectable()
export class ApplicationModule {
  constructor(
    private applicationController = inject(ApplicationController),
    private configService = inject(ConfigService),
    private storageService = inject(StorageService),
    private auditCleanupJob = inject(AuditCleanupJob),
  ) {}

  async app() {
    return this.applicationController.registerControllers();
  }

  async start() {
    const app = this.app();
    await this.onApplicationStartup();

    // register shutdown hooks
    process.on('SIGINT', this.onApplicationShutdown);
    process.on('SIGTERM', this.onApplicationShutdown);

    console.log(`Api started on port ${this.configService.envs.PORT}`);
    return app;
  }

  private async onApplicationStartup() {
    console.log('Application startup...');
    // validate configs
    this.configService.validateEnvs();
    // configure storage service
    await this.storageService.configure();
    // register background jobs (opens Redis connections, hence runtime-only)
    if (this.configService.envs.JOBS_ENABLED) {
      await this.auditCleanupJob.register();
    }
  }

  private onApplicationShutdown = async () => {
    console.log('Shutting down...');
    if (this.configService.envs.JOBS_ENABLED) {
      await this.auditCleanupJob.close();
    }
    process.exit();
  };
}
