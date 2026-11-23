import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanStatus, ScanTag, scanTags } from '#lib/server/api/storage/storage.types';

/** Characters a tag value can hold without URL-encoding; SeaweedFS stores `PutObject` tag values undecoded. */
const ENCODING_FREE = /^[A-Za-z0-9._~,-]*$/;

describe('scanTags', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T07:08:09.123Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the status with the time of the scan in ISO 8601 basic format', () => {
    expect(scanTags(ScanStatus.CLEAN)).toEqual({ [ScanTag.STATUS]: 'clean', [ScanTag.TIMESTAMP]: '20261121T070809Z' });
  });

  it('records the viruses found, comma-separated', () => {
    expect(scanTags(ScanStatus.INFECTED, ['Eicar-Test-Signature', 'Win.Test.EICAR_HDB-1'])).toEqual({
      [ScanTag.STATUS]: 'infected',
      [ScanTag.TIMESTAMP]: '20261121T070809Z',
      [ScanTag.VIRUSES]: 'Eicar-Test-Signature,Win.Test.EICAR_HDB-1',
    });
  });

  it('records no viruses tag when none were found', () => {
    expect(scanTags(ScanStatus.ERROR, [])).not.toHaveProperty(ScanTag.VIRUSES);
  });

  it.each(Object.values(ScanStatus))('writes only values that need no URL-encoding for %s', (status) => {
    for (const value of Object.values(scanTags(status, ['Eicar-Test-Signature']))) {
      expect(value).toMatch(ENCODING_FREE);
    }
  });
});
