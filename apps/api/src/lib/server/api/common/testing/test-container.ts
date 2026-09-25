import { Container, type Provider, type Token } from '@needle-di/core';

/**
 * A provider that swaps a real service for a test double. `value` only needs to implement
 * the members the code under test touches, so the cast lives here instead of in every suite.
 */
export function mockProvider<T>(provide: Token<T>, value: object): Provider<T> {
  return { provide, useValue: value as T };
}

/**
 * Fresh needle-di container with the given overrides bound. Anything not overridden resolves
 * to its real `@injectable()` implementation, so only bind mocks for external boundaries
 * (repositories, redis, mail, storage, config) and let internal logic run for real.
 */
export function createTestContainer(...providers: Provider<unknown>[]): Container {
  const container = new Container();
  for (const provider of providers) {
    container.bind(provider);
  }
  return container;
}
