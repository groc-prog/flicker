import { shutdownManager } from 'bunqueue/client';

import { logger } from '../telemetry/logging';

logger.info(`Ensuring SQLite DB exists at ${process.env.BUNQUEUE_DATA_PATH}`);
const sqliteFile = Bun.file(process.env.BUNQUEUE_DATA_PATH);
if (!(await sqliteFile.exists())) {
  logger.info(`Creating new SQLite DB at ${process.env.BUNQUEUE_DATA_PATH}`);
  await Bun.write(process.env.BUNQUEUE_DATA_PATH, '');
}

export default async function startWorkers(): Promise<void> {
  const { queue: cinemaDataScrapingQueue, worker: cinemaDataScrapingWorker } = await import('./cinema-data-scraping');
  const { queue: tmdbMetadataQueue, worker: tmdbMetadataWorker } = await import('./tmdb-metadata');

  await cinemaDataScrapingQueue.waitUntilReady();
  await cinemaDataScrapingWorker.waitUntilReady();
  await tmdbMetadataQueue.waitUntilReady();
  await tmdbMetadataWorker.waitUntilReady();

  cinemaDataScrapingQueue.add('scrape-data');

  process.on('SIGINT', async () => {
    await cinemaDataScrapingWorker.close();
    await tmdbMetadataWorker.close();
    shutdownManager();
    process.exit(0);
  });
}
