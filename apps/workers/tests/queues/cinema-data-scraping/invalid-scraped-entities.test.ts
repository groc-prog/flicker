import { afterEach, describe, expect, it, spyOn, vi } from 'bun:test';
import { count } from 'drizzle-orm';

import db from '@flicker/database';
import { AttributeCategory, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/cinema-data-scraping';
import attributesWithUnknownCategory from '../../fixtures/data/attributes-with-unknown-category.json';
import attributesWithUnknownMovies from '../../fixtures/data/attributes-with-unknown-movies.json';
import moviesPerformancesInvalidDeeplinkUrl from '../../fixtures/data/movies-performances-invalid-deeplink-url.json';
import moviesPerformancesInvalidTheatreName from '../../fixtures/data/movies-performances-invalid-theatre-name.json';
import moviesPerformancesInvalidTimeUtc from '../../fixtures/data/movies-performances-invalid-time-utc.json';
import moviesPerformancesMissingDeeplinkUrl from '../../fixtures/data/movies-performances-missing-deeplink-url.json';
import moviesPerformancesMissingTheatreName from '../../fixtures/data/movies-performances-missing-theatre-name.json';
import moviesPerformancesMissingTimeUtc from '../../fixtures/data/movies-performances-missing-time-utc.json';
import moviesWithInvalidStartingDate from '../../fixtures/data/movies-with-invalid-starting-date.json';
import moviesWithInvalidTitle from '../../fixtures/data/movies-with-invalid-title.json';
import moviesWithMissingStartingDate from '../../fixtures/data/movies-with-missing-starting-date.json';
import moviesWithMissingTitle from '../../fixtures/data/movies-with-missing-title.json';
import performanceWithMissingMoviePk from '../../fixtures/data/performance-with-missing-movie-pk.json';
import performanceWithUnknownMoviePk from '../../fixtures/data/performance-with-unknown-movie-pk.json';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';

vi.mock('../../../src/queues/tmdb-metadata', () => ({
  queue: {
    addBulk: vi.fn(),
  },
}));

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

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db
        .select({ category: attributesTable.category, key: attributesTable.key, name: attributesTable.name })
        .from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes).toHaveLength(2);

      for (const attribute of attributes) {
        expect(attribute.category).toBe(AttributeCategory.Genres);
        expect(attribute.key).toBeOneOf(['Komödie', 'Dokumentarfilm']);
        expect(attribute.name).toBeOneOf(['Komödie', 'Dokumentarfilm']);
      }
    });
  });

  describe('when the scraped attributes are invalid or missing required properties', () => {
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

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
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

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
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

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
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

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips when the `apiData.attributes.<attribute-category>.<attribute-key>.movies` array contains unknown movies', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(attributesWithUnknownMovies));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db
        .select({ category: attributesTable.category, key: attributesTable.key })
        .from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes).toHaveLength(1);
      expect(attributes[0]?.category).toBe(AttributeCategory.Genres);
      expect(attributes[0]?.key).toBe('Komödie');
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });
  });

  describe('when the scraped performances are invalid or missing required properties', () => {
    it('skips performances which are missing the `moviePk` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performanceWithMissingMoviePk),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which reference unknown movies in the `moviePk` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performanceWithUnknownMoviePk),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `theatreName` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesMissingTheatreName),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `theatreName` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesInvalidTheatreName),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `deeplinkURL` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesMissingDeeplinkUrl),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `deeplinkURL` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesInvalidDeeplinkUrl),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `timeUtc` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesMissingTimeUtc),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `timeUtc` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesPerformancesInvalidTimeUtc),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePk.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });
  });

  describe('when the scraped movies are invalid or missing required properties', () => {
    it('skips movies which do not have the `title` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesWithMissingTitle));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips movies where the `title` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesWithInvalidTitle));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips movies which do not have the `startingDate` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithMissingStartingDate),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips movies where the `startingDate` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithInvalidStartingDate),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select({ count: count() }).from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });
  });
});
