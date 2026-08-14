import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { count } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import db from '@flicker/database';
import { AttributeCategory, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/cinema-data-scraping';
import attributesWithUnknownCategory from '../../fixtures/data/attributes-with-unknown-category.json';
import attributesWithUnknownMovies from '../../fixtures/data/attributes-with-unknown-movies.json';
import performanceWithMissingMoviePk from '../../fixtures/data/performance-with-missing-movie-pk.json';
import performanceWithUnknownMoviePk from '../../fixtures/data/performance-with-unknown-movie-pk.json';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';

beforeAll(async () => {
  worker.resume();
  const migrationsFolder = path.join(import.meta.dir, '../../../../../packages/database/drizzle');
  await migrate(db, {
    migrationsFolder,
  });

  await queue.waitUntilReady();
  await worker.waitUntilReady();
});

afterEach(async () => {
  await queue.obliterateAsync();
  await db.delete(scrapedMoviesTable);
  await db.delete(scrapedMoviesToAttributesTable);
  await db.delete(moviePerformancesTable);
  await db.delete(moviePerformancesToAttributesTable);
  await db.delete(attributesTable);
});

describe('cinema-data-scraping worker', () => {
  describe('when the scraped attributes contain unused data', () => {
    it('skips attributes of unknown categories', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(attributesWithUnknownCategory),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db
        .select({ category: attributesTable.category, key: attributesTable.key, name: attributesTable.name })
        .from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count, 'Scraped movies table is not empty').toBe(0);
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
      expect(attributes, 'Attributes table is empty').toHaveLength(2);

      for (const attribute of attributes) {
        expect(attribute.category).toBe(AttributeCategory.Genres);
        expect(attribute.key).toBeOneOf(['Komödie', 'Dokumentarfilm']);
        expect(attribute.name).toBeOneOf(['Komödie', 'Dokumentarfilm']);
      }
    });
  });

  describe('when the scraped attributes are invalid', () => {
    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>` object path is not a valid object', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({
          apiData: { movies: { items: {} }, performances: { items: {} }, attributes: { genres: 'not-a-object' } },
        }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count, 'Scraped movies table is not empty').toBe(0);
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });

    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>.name` object path is missing', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({
          apiData: { movies: { items: {} }, performances: { items: {} }, attributes: { genres: { Komödie: {} } } },
        }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count, 'Scraped movies table is not empty').toBe(0);
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });

    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>.name` object path is not a string', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({
          apiData: {
            movies: { items: {} },
            performances: { items: {} },
            attributes: { genres: { Komödie: { name: 12 } } },
          },
        }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count, 'Scraped movies table is not empty').toBe(0);
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });

    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>.name` object path is not a string', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse({
          apiData: {
            movies: { items: {} },
            performances: { items: {} },
            attributes: { genres: { Komödie: { name: 12 } } },
          },
        }),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count, 'Scraped movies table is not empty').toBe(0);
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });

    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>.movies` array contains unknown movies', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(attributesWithUnknownMovies));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db
        .select({ category: attributesTable.category, key: attributesTable.key })
        .from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies, 'Scraped movies table is empty').toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId, 'Scraped movie reference ID does not match').toBe(
        attributesWithUnknownMovies.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes, 'Attributes table is empty').toHaveLength(1);
      expect(attributes[0]?.category, 'Attributes reference category does not match').toBe(AttributeCategory.Genres);
      expect(attributes[0]?.key, 'Attributes reference key does not match').toBe('Komödie');
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });
  });

  describe('when the scraped performances are invalid', () => {
    it('skips performances which are missing the `moviePk` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performanceWithMissingMoviePk),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies, 'Scraped movies table is empty').toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId, 'Scraped movie reference ID does not match').toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });

    it('skips performances which reference unknown movies in the `moviePk` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performanceWithUnknownMoviePk),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy, 'Fetch has not been called').toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries, 'DLQ is not empty').toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies, 'Scraped movies table is empty').toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId, 'Scraped movie reference ID does not match').toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count, 'Scraped movie attributes table is not empty').toBe(0);
      expect(attributes[0]?.count, 'Attributes table is not empty').toBe(0);
      expect(performances[0]?.count, 'Performances table is not empty').toBe(0);
      expect(performancesAttributes[0]?.count, 'Performances attributes table is not empty').toBe(0);
    });
  });
});
