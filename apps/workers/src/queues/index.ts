import { shutdownManager } from 'bunqueue/client';

import { logger } from '../telemetry/logging';

logger.info(`Ensuring SQLite DB exists at ${process.env.BUNQUEUE_DATA_PATH}`);
const sqliteFile = Bun.file(process.env.BUNQUEUE_DATA_PATH);
if (!(await sqliteFile.exists())) {
  logger.info(`Creating new SQLite DB at ${process.env.BUNQUEUE_DATA_PATH}`);
  await Bun.write(process.env.BUNQUEUE_DATA_PATH, '');
}

export default async function startWorkers(): Promise<void> {
  const { queue: cinemaDataScrapingQueue, worker: cinemaDataScrapingWorker } = await import('./scrape-cinema-data');
  const { queue: tmdbMetadataQueue, worker: tmdbMetadataWorker } = await import('./get-tmdb-metadata');

  await cinemaDataScrapingQueue.waitUntilReady();
  await cinemaDataScrapingWorker.waitUntilReady();
  await tmdbMetadataQueue.waitUntilReady();
  await tmdbMetadataWorker.waitUntilReady();

  cinemaDataScrapingQueue.upsertJobScheduler(
    'scheduled-scrape-cinema-data',
    {
      pattern: process.env.JOB_SCRAPE_CINEMA_DATA_CRON ?? '@daily',
    },
    {
      name: 'scrape-cinema-data',
    },
  );

  process.on('SIGINT', async () => {
    await cinemaDataScrapingWorker.close();
    await tmdbMetadataWorker.close();
    shutdownManager();
    process.exit(0);
  });
}
