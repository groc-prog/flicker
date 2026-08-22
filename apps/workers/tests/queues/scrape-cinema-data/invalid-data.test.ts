import { describe, expect, it, spyOn } from 'bun:test';
import { count } from 'drizzle-orm';

import db from '@flicker/database';
import { attributesTable } from '@flicker/database/schemas/attributes';
import { AttributeCategory } from '@flicker/database/schemas/enums';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/scrape-cinema-data';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';
import attributesWithUnknownCategoryMockData from './__fixtures__/attributes-with-unknown-category.json';
import attributesWithUnknownMoviesMockData from './__fixtures__/attributes-with-unknown-movies.json';
import moviesWithInvalidStartingDateMockData from './__fixtures__/movies-with-invalid-starting-date.json';
import moviesWithInvalidTitleMockData from './__fixtures__/movies-with-invalid-title.json';
import moviesWithMissingStartingDateMockData from './__fixtures__/movies-with-missing-starting-date.json';
import moviesWithMissingTitleMockData from './__fixtures__/movies-with-missing-title.json';
import performanceWithMissingMoviePkMockData from './__fixtures__/performance-with-missing-movie-pk.json';
import performanceWithUnknownMoviePkMockData from './__fixtures__/performance-with-unknown-movie-pk.json';
import performancesInvalidDeeplinkUrlMockData from './__fixtures__/performances-invalid-deeplink-url.json';
import performancesInvalidTheatreNameMockData from './__fixtures__/performances-invalid-theatre-name.json';
import InvalidTimeUtcMockData from './__fixtures__/performances-invalid-time-utc.json';
import MissingDeeplinkUrlMockData from './__fixtures__/performances-missing-deeplink-url.json';
import MissingTheatreNameMockData from './__fixtures__/performances-missing-theatre-name.json';
import MissingTimeUtcMockData from './__fixtures__/performances-missing-time-utc.json';

describe('scrape-cinema-data worker', () => {
  describe('when the scraped attributes contain unused data', () => {
    it('skips attributes of unknown categories', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(attributesWithUnknownCategoryMockData),
      );

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
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(attributesWithUnknownMoviesMockData),
      );

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
        getScrapedDataResponse(performanceWithMissingMoviePkMockData),
      );

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which reference unknown movies in the `moviePk` property', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performanceWithUnknownMoviePkMockData),
      );

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `theatreName` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(MissingTheatreNameMockData));

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `theatreName` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performancesInvalidTheatreNameMockData),
      );

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `deeplinkURL` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(MissingDeeplinkUrlMockData));

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `deeplinkURL` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(performancesInvalidDeeplinkUrlMockData),
      );

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances which do not have the `timeUtc` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(MissingTimeUtcMockData));

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });

    it('skips performances where the `timeUtc` property has a invalid value', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(InvalidTimeUtcMockData));

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

      const scrapedMovies = await db
        .select({ scrapedMovieId: scrapedMoviesTable.scrapedMovieId })
        .from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovies[0]?.scrapedMovieId).toBe(
        performanceWithMissingMoviePkMockData.apiData.movies.items['f3e754ef-5e4c-4b0a-9f64-014e9a96af45'].pk,
      );
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
    });
  });

  describe('when the scraped movies are invalid or missing required properties', () => {
    it('skips movies which do not have the `title` property defined', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithMissingTitleMockData),
      );

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
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithInvalidTitleMockData),
      );

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
        getScrapedDataResponse(moviesWithMissingStartingDateMockData),
      );

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
        getScrapedDataResponse(moviesWithInvalidStartingDateMockData),
      );

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
