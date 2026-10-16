import { describe, expect, it, vi } from 'vitest';
import { ProviderHealth, ProviderHealthState } from '#lib/server/api/auth/auth.provider-health';

const FAILURE = 'PROVIDER_FAILED: set X=false and restart to bypass';

const build = (enabled: boolean) => {
  const log = { error: vi.fn() };
  return { log, health: new ProviderHealth({ enabled, failureMessage: FAILURE, log }) };
};

describe('ProviderHealth', () => {
  it('reports disabled when the switch is off, whatever happened since', () => {
    const { health } = build(false);
    health.recordFailure(new Error('x'));
    health.recordSuccess();

    expect(health.health).toBe(ProviderHealthState.DISABLED);
  });

  it('is unknown before any call, then follows the most recent call', () => {
    const { health } = build(true);
    expect(health.health).toBe(ProviderHealthState.UNKNOWN);

    health.recordFailure();
    expect(health.health).toBe(ProviderHealthState.UNAVAILABLE);

    health.recordSuccess();
    expect(health.health).toBe(ProviderHealthState.AVAILABLE);

    health.recordFailure();
    expect(health.health).toBe(ProviderHealthState.UNAVAILABLE);
  });

  it('logs one entry with the failure message per failure and none for a success', () => {
    const { log, health } = build(true);

    health.recordSuccess();
    expect(log.error).not.toHaveBeenCalled();

    health.recordFailure(new Error('boom'));
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error.mock.calls[0]?.[1]).toBe(FAILURE);
    expect(log.error.mock.calls[0]?.[0]).toMatchObject({ err: expect.any(Error) });
  });

  it('logs an empty context when no error is given', () => {
    const { log, health } = build(true);

    health.recordFailure();

    expect(log.error).toHaveBeenCalledWith({}, FAILURE);
  });

  it('works without a logger', () => {
    const health = new ProviderHealth({ enabled: true, failureMessage: FAILURE });

    expect(() => health.recordFailure()).not.toThrow();
    expect(health.health).toBe(ProviderHealthState.UNAVAILABLE);
  });
});
