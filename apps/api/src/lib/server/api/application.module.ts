import type { ServerType } from '@hono/node-server';
import { inject, injectable } from '@needle-di/core';
import { ApplicationController } from './application.controller';
import { ConfigService } from './common/configs/config.service';
import { AuditCleanupJob } from './jobs/audit-cleanup.job';
import { StorageService } from './storage/storage.service';

/** The whole shutdown sequence must finish within this, leaving room inside the platform's kill grace period. */
const SHUTDOWN_TIMEOUT_MS = 8_000;

interface ShutdownResources {
  server: Pick<ServerType, 'close'>;
  flushTelemetry: () => Promise<void>;
}

interface StartedApplication {
  app: ReturnType<ApplicationController['registerControllers']>;
  handleShutdownSignals: (resources: ShutdownResources) => void;
}

@injectable()
export class ApplicationModule {
  constructor(
    private applicationController = inject(ApplicationController),
    private configService = inject(ConfigService),
    private storageService = inject(StorageService),
    private auditCleanupJob = inject(AuditCleanupJob),
  ) {}

  /** Runs startup, then builds the app: the one place routes and middleware are registered. */
  async start(): Promise<StartedApplication> {
    await this.onApplicationStartup();
    const app = this.applicationController.registerControllers();

    console.log(`Api started on port ${this.configService.envs.PORT}`);
    return { app, handleShutdownSignals: this.handleShutdownSignals };
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

  /** Installs the handlers; call once the server is listening. Repeat signals are ignored rather than left to kill the process mid-sequence. */
  private handleShutdownSignals = (resources: ShutdownResources) => {
    let shuttingDown = false;
    const onSignal = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void this.onApplicationShutdown(resources);
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  };

  /** Runs each step in order. A step that errors does not stop the next, and the limit is a ref'd timer so a stalled sequence still exits. */
  private async onApplicationShutdown({ server, flushTelemetry }: ShutdownResources) {
    console.log('Shutting down...');
    const steps = [
      {
        name: 'close HTTP',
        run: () => new Promise<void>((resolve, reject) => server.close((error?: Error) => (error ? reject(error) : resolve()))),
      },
      { name: 'close jobs', run: () => this.auditCleanupJob.close() },
      { name: 'flush telemetry', run: flushTelemetry },
    ];

    const unfinished = new Set(steps.map((step) => step.name));
    const shutdownTimer = setTimeout(() => {
      console.error(`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS}ms. Unfinished: ${[...unfinished].join(', ')}`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    let clean = true;
    for (const { name, run } of steps) {
      try {
        await run();
      } catch (error) {
        clean = false;
        console.error(`Shutdown step failed: ${name}`, error);
      }
      unfinished.delete(name);
    }

    clearTimeout(shutdownTimer);
    process.exit(clean ? 0 : 1);
  }
}
