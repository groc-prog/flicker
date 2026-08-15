import { afterEach, beforeEach, describe, expect, it, spyOn, vi } from 'bun:test';

import db from '@flicker/database';
import { attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/scrape-cinema-data';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';
import moviesMultipleMockData from './__fixtures__/movies-multiple.json';

const mockAddBulk = vi.fn();
vi.mock('../../../src/queues/get-tmdb-metadata', () => ({
  queue: {
    addBulk: mockAddBulk,
  },
}));

beforeEach(() => {
  mockAddBulk.mockClear();
});

afterEach(async () => {
  await queue.obliterateAsync();
  await db.delete(scrapedMoviesTable);
  await db.delete(scrapedMoviesToAttributesTable);
  await db.delete(moviePerformancesTable);
  await db.delete(moviePerformancesToAttributesTable);
  await db.delete(attributesTable);
});

describe('scrape-cinema-data worker', () => {
  describe('when a movie is saved', () => {
    it('enqueues follow-up-jobs for each movie', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesMultipleMockData));

      const job = await queue.add(
        crypto.randomUUID(),
        {},
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select().from(scrapedMoviesTable);

      expect(scrapedMovies).toHaveLength(2);
      expect(mockAddBulk).toHaveBeenNthCalledWith(1, [
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
