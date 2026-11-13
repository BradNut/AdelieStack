import { afterEach } from 'vitest';
import { assertNoBlockedNetworkCalls, installNetworkGuard } from './network-guard';

installNetworkGuard();

// Fails the test that made a blocked call even when the code under test swallowed the thrown error.
afterEach(() => {
  assertNoBlockedNetworkCalls();
});
