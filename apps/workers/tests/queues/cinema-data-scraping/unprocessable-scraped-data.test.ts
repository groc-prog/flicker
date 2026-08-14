import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { count } from 'drizzle-orm';

import db from '@flicker/database';
import { attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/cinema-data-scraping';
import { getScrapedDataResponse, waitForJobFailure } from '../../fixtures/queue';

afterEach(async () => {
  await queue.obliterateAsync();
  await db.delete(scrapedMoviesTable);
  await db.delete(moviePerformancesTable);
  await db.delete(attributesTable);
});

async function assertDataScrapingError(jobId: string) {
  const dlqEntries = queue.getDlq();
  expect(dlqEntries).toHaveLength(1);
  expect(dlqEntries[0]?.job.id).toBe(jobId);

  const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
  const attributes = await db.select({ count: count() }).from(attributesTable);
  const performances = await db.select({ count: count() }).from(moviePerformancesTable);

  expect(scrapedMovies[0]?.count).toBe(0);
  expect(attributes[0]?.count).toBe(0);
  expect(performances[0]?.count).toBe(0);
}

describe('cinema-data-scraping worker', () => {
  describe('when the network is unavailable', () => {
    it('it fails the job and moves it to the DLQ', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobFailure(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });
  });

  describe('when the scraped data does not have the expected structure', () => {
    it('throws when the opening curly brace can not be found', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <script id="pmkino-frontpage-script-js-extra"></script>
              </head>
              <body>
              </body>
              </html>
            `,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          },
        ),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe('JSON data not found in unparsed data');

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the closing curly brace can not be found', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <script id="pmkino-frontpage-script-js-extra">var someVar='{'</script>
              </head>
              <body>
              </body>
              </html>
            `,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          },
        ),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe('JSON data not found in unparsed data');

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the extracted data does not contain a `apiData` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse({ foo: 'foo-value' }));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'apiData key not found in parsed data. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData` property is not a object', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse({ apiData: 'not-a-object' }));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'Value for apiData key is not an object. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData` object does not have a `movies` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse({ apiData: {} }));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'movies key not found in parsed data. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData` object does not have a `performances` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse({ apiData: { movies: {} } }));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'performances key not found in parsed data. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData` object does not have a `attributes` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({ apiData: { movies: {}, performances: {} } }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'attributes key not found in parsed data. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData.movies.items` object path is not a valid object', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({ apiData: { movies: {}, performances: {}, attributes: {} } }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'Value for movies key is not an object. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData.performances.items` object path is not a valid object', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({ apiData: { movies: { items: {} }, performances: {}, attributes: {} } }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'Value for performances key is not an object. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });

    it('throws when the `apiData.attributes` object path is not a valid object', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({ apiData: { movies: { items: {} }, performances: { items: {} }, attributes: 2 } }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        'Value for attributes key is not an object. This might indicate that the embedded data has changed',
      );

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      await assertDataScrapingError(job.id);
    });
  });
});
