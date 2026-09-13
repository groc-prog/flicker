import { shutdownManager } from 'bunqueue/client';

import { logger } from '../telemetry/logging';
import { queue as tmdbMetadataQueue, worker as tmdbMetadataWorker } from './get-tmdb-metadata';
import { queue as cinemaDataScrapingQueue, worker as cinemaDataScrapingWorker } from './scrape-cinema-data';

export default async function startWorkers(): Promise<void> {
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

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    logger.error(error, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (error) => {
    logger.error(error, 'Unhandled rejected promise');
    shutdown('unhandledRejection', 1);
  });
}

async function shutdown(signal: string, exitCode: number): Promise<void> {
  logger.info(`Shutdown signal ${signal} received. Starting graceful teardown`);

  try {
    await cinemaDataScrapingWorker.close();
    await tmdbMetadataWorker.close();
    shutdownManager();
    logger.info('Teardown completed successfully');
    process.exit(exitCode);
  } catch (error) {
    logger.error(error, 'Error during graceful teardown');
    process.exit(1);
  }
}
