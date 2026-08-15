import path from 'node:path';

import { afterAll, beforeAll } from 'bun:test';
import { shutdownManager } from 'bunqueue/client';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import db from '@flicker/database';

import { queue, worker } from '../src/queues/scrape-cinema-data';

dayjs.extend(utcPlugin);

beforeAll(async () => {
  const migrationsFolder = path.join(import.meta.dir, '../../../packages/database/drizzle');
  await migrate(db, {
    migrationsFolder,
  });

  await queue.waitUntilReady();
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker.close();
  shutdownManager();
});
