import { mock } from 'bun:test';

/**
 * Creates an auto-mocked instance of an interaction class for testing.
 * Missing properties and methods are dynamically generated as `bun:test` mocks on access.
 *
 * @template T - The target interaction class instance type.
 * @param cls - The interaction class constructor or type reference containing the target prototype.
 * @param overrides - Optional initial values or method implementations to override defaults.
 * @returns An auto-mocked instance that satisfies `instanceof` checks for `cls`.
 */
export function createMockedInteraction<T extends object>(
  cls: { prototype: T },
  overrides?: Record<string, unknown>,
): T {
  const base = Object.create(cls.prototype);
  const mockCache = new Map<string | symbol, unknown>();

  return new Proxy(base, {
    get(_, prop) {
      if (overrides && Reflect.has(overrides, prop)) {
        return Reflect.get(overrides, prop);
      }

      if (mockCache.has(prop)) {
        return mockCache.get(prop);
      }

      if (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol') {
        return undefined;
      }

      const autoMock = mock(async () => {});
      mockCache.set(prop, autoMock);
      return autoMock;
    },
  }) as T;
}
