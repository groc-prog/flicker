import path from 'node:path';
import { afterEach, beforeEach } from 'node:test';

import { afterAll, beforeAll, vi } from 'bun:test';
import { shutdownManager } from 'bunqueue/client';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import db from '@flicker/database';
import { attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { moviesTable } from '@flicker/database/schemas/movies';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue as getTmdbMetadataQueue, worker as getTmdbMetadataWorker } from '../src/queues/get-tmdb-metadata';
import { queue as scrapeCinemaDataQueue, worker as scrapeCinemaDataWorker } from '../src/queues/scrape-cinema-data';

dayjs.extend(utcPlugin);

beforeAll(async () => {
  const migrationsFolder = path.join(import.meta.dir, '../../../packages/database/drizzle');
  await migrate(db, {
    migrationsFolder,
  });

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

beforeEach(async () => {
  await scrapeCinemaDataQueue.obliterateAsync();
  await getTmdbMetadataQueue.obliterateAsync();

  await db.delete(attributesTable);
  await db.delete(scrapedMoviesToAttributesTable);
  await db.delete(moviePerformancesToAttributesTable);
  await db.delete(moviePerformancesTable);
  await db.delete(moviesTable);
  await db.delete(scrapedMoviesTable);
});

afterEach(() => {
  vi.restoreAllMocks();
});
