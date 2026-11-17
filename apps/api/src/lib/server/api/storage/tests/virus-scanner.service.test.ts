import { Container } from '@needle-di/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { ScanResult, VirusScannerService } from '#lib/server/api/storage/virus-scanner.service';
import { createConfigServiceMock } from '../../../../../test/mocks/config.mock';
import { createLoggerServiceMock } from '../../../../../test/mocks/logger.mock';
import { stubClamd } from './storage-test.helpers';

const BYTES = Buffer.from('file-bytes');

const createScanner = ({ enabled = true } = {}) => {
  const container = new Container();
  container.bind({
    provide: ConfigService,
    useValue: createConfigServiceMock({ ANTIVIRUS_ENABLED: enabled, CLAMAV_HOST: 'localhost', CLAMAV_PORT: 3310 }) as unknown as ConfigService,
  });
  container.bind({ provide: LoggerService, useValue: createLoggerServiceMock() as unknown as LoggerService });
  return container.get(VirusScannerService);
};

describe('VirusScannerService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an error when clamd gives no verdict', async () => {
    stubClamd({ isInfected: null, viruses: [] });

    const response = await createScanner().scanBuffer(BYTES);

    expect(response.result).toBe(ScanResult.ERROR);
    expect(response.error).toBeTruthy();
  });

  it.each([
    ['undefined', undefined],
    ['a non-boolean', 'maybe'],
  ])('reports an error when the verdict is %s', async (_label, isInfected) => {
    stubClamd({ isInfected: isInfected as unknown as boolean, viruses: [] });

    const response = await createScanner().scanBuffer(BYTES);

    expect(response.result).toBe(ScanResult.ERROR);
  });

  it('reports clean when clamd says the file is not infected', async () => {
    const { scanStream } = stubClamd({ isInfected: false, viruses: [] });

    await expect(createScanner().scanBuffer(BYTES)).resolves.toEqual({ result: ScanResult.CLEAN });
    expect(scanStream).toHaveBeenCalledOnce();
  });

  it('reports infected with the viruses clamd named', async () => {
    stubClamd({ isInfected: true, viruses: ['Eicar-Test-Signature'] });

    await expect(createScanner().scanBuffer(BYTES)).resolves.toEqual({ result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] });
  });

  it('reports an error when clamd cannot be reached', async () => {
    const { init } = stubClamd({ isInfected: false, viruses: [] });
    init.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(createScanner().scanBuffer(BYTES)).resolves.toEqual({ result: ScanResult.ERROR, error: 'connect ECONNREFUSED' });
  });

  it('reports clean without contacting clamd when antivirus is disabled', async () => {
    const { init, scanStream } = stubClamd({ isInfected: null, viruses: [] });

    await expect(createScanner({ enabled: false }).scanBuffer(BYTES)).resolves.toEqual({ result: ScanResult.CLEAN });
    expect(init).not.toHaveBeenCalled();
    expect(scanStream).not.toHaveBeenCalled();
  });
});
