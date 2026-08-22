import { afterEach, beforeAll, beforeEach, vi } from 'bun:test';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import { applyPendingMigrations, truncateDatabase } from '@flicker/test-utils/setup.js';

dayjs.extend(utcPlugin);

beforeAll(async () => {
  await applyPendingMigrations();
});

beforeEach(async () => {
  await truncateDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});
