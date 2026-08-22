import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'bun:test';
import { shutdownManager } from 'bunqueue/client';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import { applyPendingMigrations, truncateDatabase } from '@flicker/test-utils/setup.js';

import { queue as getTmdbMetadataQueue, worker as getTmdbMetadataWorker } from '../src/queues/get-tmdb-metadata';
import { queue as scrapeCinemaDataQueue, worker as scrapeCinemaDataWorker } from '../src/queues/scrape-cinema-data';

dayjs.extend(utcPlugin);

beforeEach(async () => {
  await scrapeCinemaDataQueue.obliterateAsync();
  await getTmdbMetadataQueue.obliterateAsync();

  await truncateDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeAll(async () => {
  await applyPendingMigrations();

  await scrapeCinemaDataQueue.waitUntilReady();
  await getTmdbMetadataQueue.waitUntilReady();
  await scrapeCinemaDataWorker.waitUntilReady();
  await getTmdbMetadataWorker.waitUntilReady();
});

afterAll(async () => {
  await scrapeCinemaDataWorker.close();
  await getTmdbMetadataWorker.close();
  shutdownManager();
});
