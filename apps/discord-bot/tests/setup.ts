import { afterEach, beforeAll, beforeEach, mock, vi } from 'bun:test';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import { applyPendingMigrations, truncateDatabase } from '@flicker/test-utils/setup.js';

mock.module('i18next', () => ({
  default: { init: async () => {} },
  t: (key: string) => key,
}));

export const mockedTraceparent = {
  value: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' as string | undefined,
};

mock.module('@opentelemetry/api', () => ({
  SpanStatusCode: { ERROR: 2 },
  ROOT_CONTEXT: {},
  context: { active: () => ({}) },
  propagation: {
    extract: () => ({}),
    inject: (_context: unknown, carrier: { traceparent?: string }) => {
      carrier.traceparent = mockedTraceparent.value;
    },
  },
  trace: {
    getSpan: () => undefined,
    getTracer: () => ({
      startActiveSpan: async (_name: string, callback: (span: object) => Promise<unknown>) =>
        callback({ recordException: () => {}, setStatus: () => {} }),
    }),
  },
}));

export const mockedClient = {
  commandIds: new Map(),
  commands: new Map(),
  modals: new Map(),
};

mock.module(`${import.meta.dir}/../src/index.ts`, () => ({ client: mockedClient }));

dayjs.extend(utcPlugin);

beforeEach(async () => {
  await truncateDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
  mockedTraceparent.value = undefined;
  mockedClient.commandIds.clear();
  mockedClient.commands.clear();
  mockedClient.modals.clear();
});

beforeAll(async () => {
  await applyPendingMigrations();
});
