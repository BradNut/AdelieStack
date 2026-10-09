import { describe, expect, it, vi } from 'vitest';
import { getClientIp } from '../ip';

describe('getClientIp', () => {
  it('returns first forwarded IP when trust proxy is enabled', () => {
    const header = vi.fn().mockReturnValue('203.0.113.10, 70.41.3.18, 150.172.238.178');
    const context = { req: { header } } as never;

    const ip = getClientIp(context, true);

    expect(ip).toBe('203.0.113.10');
    expect(header).toHaveBeenCalledWith('x-forwarded-for');
  });

  it('returns 127.0.0.1 when trust proxy is enabled but header is missing', () => {
    const header = vi.fn().mockReturnValue(undefined);
    const context = { req: { header } } as never;

    const ip = getClientIp(context, true);

    expect(ip).toBe('127.0.0.1');
  });

  it('returns 127.0.0.1 and does not read forwarded header when trust proxy is disabled', () => {
    const header = vi.fn().mockReturnValue('203.0.113.10');
    const context = { req: { header } } as never;

    const ip = getClientIp(context, false);

    expect(ip).toBe('127.0.0.1');
    expect(header).not.toHaveBeenCalled();
  });
});
