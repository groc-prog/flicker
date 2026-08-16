import { describe, expect, it, spyOn } from 'bun:test';

import db from '@flicker/database';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue as getTmdbMetadataQueue } from '../../../src/queues/get-tmdb-metadata';
import { queue, worker } from '../../../src/queues/scrape-cinema-data';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';
import moviesMultipleMockData from './__fixtures__/movies-multiple.json';

describe('scrape-cinema-data worker', () => {
  describe('when a movie is saved', () => {
    it('enqueues follow-up-jobs for each movie', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesMultipleMockData));
      const addBulkSpy = spyOn(getTmdbMetadataQueue, 'addBulk');
      const job = await queue.add(
        crypto.randomUUID(),
        {},
        {
          attempts: 1,
        },
      );
      await waitForJobCompletion(worker, job.id);
      expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();
      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      expect(scrapedMovies).toHaveLength(2);
      expect(addBulkSpy).toHaveBeenNthCalledWith(1, [
        {
          name: `get-tmdb-metadata-${scrapedMovies[0]!.id}`,
          data: { id: scrapedMovies[0]!.id },
        },
        {
          name: `get-tmdb-metadata-${scrapedMovies[1]!.id}`,
          data: { id: scrapedMovies[1]!.id },
        },
      ]);
    });
  });
});
