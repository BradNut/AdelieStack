import { afterEach, describe, expect, it, vi } from 'vitest';

const startOpenTelemetrySdk = vi.hoisted(() => vi.fn());

vi.mock('dotenv/config', () => ({}));
vi.mock('@adelie/shared/otel', () => ({ getDevOnlySentryOptions: () => ({}), startOpenTelemetrySdk }));
vi.mock('@sentry/node', () => ({ init: vi.fn() }));

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;

let added: Array<{ signal: NodeJS.Signals; listener: NodeJS.SignalsListener }> = [];

/** Imports a fresh copy of the real module, keeping the signal listeners the import added. */
async function importInstrument() {
  vi.resetModules();
  const before = SIGNALS.flatMap((signal) => process.listeners(signal));
  const instrument = await import('./instrument.mjs');
  added = SIGNALS.flatMap((signal) => process.listeners(signal).map((listener) => ({ signal, listener }))).filter(
    ({ listener }) => !before.includes(listener),
  );
  return instrument;
}

afterEach(() => {
  // A listener left behind would make the test runner ignore real signals.
  for (const { signal, listener } of added) process.removeListener(signal, listener);
  added = [];
});

describe('instrument', () => {
  describe('with OpenTelemetry on', () => {
    const shutdown = vi.fn(async () => {});

    it('adds no signal listeners', async () => {
      startOpenTelemetrySdk.mockReturnValue({ shutdown });

      await importInstrument();

      expect(added).toEqual([]);
    });

    it('shuts the SDK down on flush, and not before', async () => {
      startOpenTelemetrySdk.mockReturnValue({ shutdown });

      const instrument = await importInstrument();
      expect(shutdown).not.toHaveBeenCalled();

      await instrument.flushTelemetry();

      expect(shutdown).toHaveBeenCalledOnce();
    });
  });

  describe('with OpenTelemetry off', () => {
    it('adds no signal listeners and flushes as a no-op', async () => {
      startOpenTelemetrySdk.mockReturnValue(undefined);

      const instrument = await importInstrument();

      expect(added).toEqual([]);
      await expect(instrument.flushTelemetry()).resolves.toBeUndefined();
    });
  });
});
