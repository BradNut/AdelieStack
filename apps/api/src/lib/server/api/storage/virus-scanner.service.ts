import { Readable } from 'node:stream';
import { inject, injectable } from '@needle-di/core';
import NodeClam from 'clamscan';
import { ConfigService } from '../common/configs/config.service';
import { LoggerService } from '../common/services/logger.service';

export const ScanResult = {
  CLEAN: 'clean',
  INFECTED: 'infected',
  ERROR: 'error',
} as const;

export type ScanResult = (typeof ScanResult)[keyof typeof ScanResult];

export type ScanResponse = {
  result: ScanResult;
  viruses?: string[];
  error?: string;
};

// ClamAV's clamd daemon listens on this TCP port by default.
const DEFAULT_CLAMAV_PORT = 3310;
const SCAN_TIMEOUT_MS = 60_000;

/**
 * Wraps the `clamscan` client and talks to a clamd daemon over TCP.
 *
 * The daemon connection is created lazily on the first scan so constructing the
 * service (and the DI container) never opens a socket. Scanning is gated on
 * `ANTIVIRUS_ENABLED`: when disabled, every scan short-circuits to CLEAN and the
 * daemon is never contacted.
 */
@injectable()
export class VirusScannerService {
  private clamScan: NodeClam | null = null;
  private initPromise: Promise<NodeClam> | null = null;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly loggerService = inject(LoggerService),
  ) {}

  /** Whether antivirus scanning is turned on for this environment. */
  get isEnabled(): boolean {
    return this.configService.envs.ANTIVIRUS_ENABLED;
  }

  /**
   * Creates the clamd client on first use and caches it. Concurrent callers share
   * a single in-flight initialization so the daemon is only contacted once.
   */
  private async getClient(): Promise<NodeClam> {
    if (this.clamScan) {
      return this.clamScan;
    }

    this.initPromise ??= (async () => {
      this.loggerService.log.info('Initializing ClamAV scanner...');
      const clamScan = await new NodeClam().init({
        clamdscan: {
          host: this.configService.envs.CLAMAV_HOST,
          port: this.configService.envs.CLAMAV_PORT || DEFAULT_CLAMAV_PORT,
          timeout: SCAN_TIMEOUT_MS,
          multiscan: false,
        },
        preference: 'clamdscan',
      });
      this.clamScan = clamScan;
      this.loggerService.log.info('ClamAV scanner initialized successfully');
      return clamScan;
    })();

    try {
      return await this.initPromise;
    } catch (error) {
      // Allow a later call to retry instead of caching the failed attempt.
      this.initPromise = null;
      this.loggerService.log.error({ error }, 'Failed to initialize ClamAV scanner');
      throw error;
    }
  }

  /** Scans an in-memory buffer by streaming it through clamd. */
  async scanBuffer(buffer: Buffer): Promise<ScanResponse> {
    return this.scanStream(Readable.from(buffer));
  }

  /**
   * Scans a readable stream for viruses. When scanning is disabled this resolves to
   * CLEAN without contacting the daemon. Transport/daemon failures resolve to ERROR
   * rather than throwing so callers can decide how to fail closed.
   */
  async scanStream(stream: Readable): Promise<ScanResponse> {
    if (!this.isEnabled) {
      return { result: ScanResult.CLEAN };
    }

    try {
      const clamScan = await this.getClient();
      const { isInfected, viruses } = await clamScan.scanStream(stream);

      if (isInfected) {
        this.loggerService.log.warn({ viruses }, 'Virus detected during scan');
        return { result: ScanResult.INFECTED, viruses: viruses ?? [] };
      }

      return { result: ScanResult.CLEAN };
    } catch (error) {
      this.loggerService.log.error({ error }, 'Error scanning stream');
      return { result: ScanResult.ERROR, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /** Verifies the daemon is reachable and responsive. */
  async healthCheck(): Promise<boolean> {
    if (!this.isEnabled) {
      return true;
    }

    try {
      const clamScan = await this.getClient();
      const version = await clamScan.getVersion();
      this.loggerService.log.debug({ version }, 'ClamAV health check passed');
      return true;
    } catch (error) {
      this.loggerService.log.error({ error }, 'ClamAV health check failed');
      return false;
    }
  }
}
