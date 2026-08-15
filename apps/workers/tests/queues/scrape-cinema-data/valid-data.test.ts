import { afterEach, describe, expect, it, spyOn, vi } from 'bun:test';
import dayjs from 'dayjs';
import { count } from 'drizzle-orm';

import db from '@flicker/database';
import { AttributeCategory, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/scrape-cinema-data';
import { getScrapedDataResponse, waitForJobCompletion } from '../../fixtures/queue';
import attributesAllCategories from './__fixtures__/attributes-all-categories.json';
import fullDatasetMockData from './__fixtures__/full-dataset.json';
import moviesMultipleMockData from './__fixtures__/movies-multiple.json';
import moviesOptionalPropertiesInvalidMockData from './__fixtures__/movies-optional-properties-invalid.json';
import moviesOptionalPropertiesMissingMockData from './__fixtures__/movies-optional-properties-missing.json';
import moviesWithAttributesMockData from './__fixtures__/movies-with-attributes.json';
import moviesWithPerformancesAndPerformanceAttributesMockData from './__fixtures__/movies-with-performances-and-performance-attributes.json';
import moviesWithPerformancesMockData from './__fixtures__/movies-with-performances.json';
import moviesWithoutRelationsMockData from './__fixtures__/movies-without-relations.json';

vi.mock('../../../src/queues/get-tmdb-metadata', () => ({
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

describe('scrape-cinema-data worker', () => {
  describe('when the scraped attributes contain valid data', () => {
    it('inserts attributes from all tracked categories', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(attributesAllCategories));

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
      const attributes = await db.select().from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies[0]?.count).toBe(0);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes).toHaveLength(4);

      const attributeGenres = attributes.find((attribute) => attribute.category === AttributeCategory.Genres);
      const attributeFsk = attributes.find((attribute) => attribute.category === AttributeCategory.Fsk);
      const attributeSeatClass = attributes.find((attribute) => attribute.category === AttributeCategory.SeatClass);
      const attributeTechnical = attributes.find((attribute) => attribute.category === AttributeCategory.Technical);

      expect(attributeGenres?.category).toBe(AttributeCategory.Genres);
      expect(attributeGenres?.key).toBe('Komödie');
      expect(attributeGenres?.name).toBe('Komödie');

      expect(attributeFsk?.category).toBe(AttributeCategory.Fsk);
      expect(attributeFsk?.key).toBe('0');
      expect(attributeFsk?.name).toBe('0');

      expect(attributeSeatClass?.category).toBe(AttributeCategory.SeatClass);
      expect(attributeSeatClass?.key).toBe('2');
      expect(attributeSeatClass?.name).toBe('Kategorie 2');

      expect(attributeTechnical?.category).toBe(AttributeCategory.Technical);
      expect(attributeTechnical?.key).toBe('_pm_preview');
      expect(attributeTechnical?.name).toBe('Vorschau');
    });

    it('inserts movies with optional properties missing', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesOptionalPropertiesMissingMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBeNull();
      expect(scrapedMovie.description).toBeNull();
      expect(scrapedMovie.runtime).toBeNull();
      expect(scrapedMovie.posterPath).toBeNull();
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));
    });

    it('inserts movies with optional properties invalid', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesOptionalPropertiesInvalidMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBeNull();
      expect(scrapedMovie.description).toBeNull();
      expect(scrapedMovie.runtime).toBeNull();
      expect(scrapedMovie.posterPath).toBeNull();
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));
    });

    it('inserts movies without any performances or attributes', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithoutRelationsMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBe('Practical Magic 2');
      expect(scrapedMovie.description).toBe(
        'Mit Sandra Bullock und Nicole Kidman in den Hauptrollen kehrt „Practical Magic 2 – Zauberhafte Schwestern“ in eine Welt zurück, die von schelmischem Zauber im Mondlicht und mächtiger Ahnenmagie geprägt ist. Die Owens-Schwestern müssen sich dem dunklen Fluch stellen, der ihre Familie ein für alle Mal zu zerreißen droht.',
      );
      expect(scrapedMovie.runtime).toBe(100);
      expect(scrapedMovie.posterPath).toBe('https://mcs.planetmutlu.com/tmdb/image/uA8ytJv17alSiREcUthbYAdiPCX.jpg');
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));
    });

    it('inserts movies with attributes', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithAttributesMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select().from(scrapedMoviesToAttributesTable);
      const attributes = await db.select().from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes).toHaveLength(5);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes).toHaveLength(5);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBe('Practical Magic 2');
      expect(scrapedMovie.description).toBe(
        'Mit Sandra Bullock und Nicole Kidman in den Hauptrollen kehrt „Practical Magic 2 – Zauberhafte Schwestern“ in eine Welt zurück, die von schelmischem Zauber im Mondlicht und mächtiger Ahnenmagie geprägt ist. Die Owens-Schwestern müssen sich dem dunklen Fluch stellen, der ihre Familie ein für alle Mal zu zerreißen droht.',
      );
      expect(scrapedMovie.runtime).toBe(100);
      expect(scrapedMovie.posterPath).toBe('https://mcs.planetmutlu.com/tmdb/image/uA8ytJv17alSiREcUthbYAdiPCX.jpg');
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));

      for (const attribute of attributes) {
        expect(attribute.category).toBeOneOf([AttributeCategory.Genres, AttributeCategory.Technical]);
        expect(attribute.key).toBeOneOf(['Drama', 'Komödie', 'Fantasy', '_pm_preview', '2d']);
        expect(attribute.name).toBeOneOf(['Drama', 'Komödie', 'Fantasy', 'Vorschau', '2D']);
      }

      for (const movieAttribute of scrapedMovieAttributes) {
        expect(movieAttribute.scrapedMovieId).toBe(scrapedMovie.id);
        expect(movieAttribute.attributeId).toBeOneOf(attributes.map(({ id }) => id));
      }
    });

    it('inserts movies with performances', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithPerformancesMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select().from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances).toHaveLength(1);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBe('Practical Magic 2');
      expect(scrapedMovie.description).toBe(
        'Mit Sandra Bullock und Nicole Kidman in den Hauptrollen kehrt „Practical Magic 2 – Zauberhafte Schwestern“ in eine Welt zurück, die von schelmischem Zauber im Mondlicht und mächtiger Ahnenmagie geprägt ist. Die Owens-Schwestern müssen sich dem dunklen Fluch stellen, der ihre Familie ein für alle Mal zu zerreißen droht.',
      );
      expect(scrapedMovie.runtime).toBe(100);
      expect(scrapedMovie.posterPath).toBe('https://mcs.planetmutlu.com/tmdb/image/uA8ytJv17alSiREcUthbYAdiPCX.jpg');
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));

      const moviePerformance = performances[0]!;
      expect(moviePerformance.scrapedMovieId).toBe(scrapedMovie.id);
      expect(moviePerformance.scrapedPerformanceId).toBe('4c339fe8-e78c-4dbc-b90e-2136ecaa8df2-959582');
      expect(moviePerformance.theatre).toBe('Saal 3');
      expect(moviePerformance.seatingDeepLink).toBe(
        'https://kinoapi.dieselkino.at/?performanceId=959582d&cinemaNumber=04',
      );
      expect(moviePerformance.showtime).toEqual(dayjs.utc(1782924300000).toDate());
      expect(moviePerformance.movieId).toBeNull();
    });

    it('inserts movies with performances and performance attributes', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        getScrapedDataResponse(moviesWithPerformancesAndPerformanceAttributesMockData),
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

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select().from(attributesTable);
      const performances = await db.select().from(moviePerformancesTable);
      const performancesAttributes = await db.select().from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances).toHaveLength(1);
      expect(performancesAttributes).toHaveLength(2);
      expect(attributes).toHaveLength(2);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3e754ef-5e4c-4b0a-9f64-014e9a96af45');
      expect(scrapedMovie.title).toBe('Practical Magic 2 - Zauberhafte Schwestern');
      expect(scrapedMovie.originalTitle).toBe('Practical Magic 2');
      expect(scrapedMovie.description).toBe(
        'Mit Sandra Bullock und Nicole Kidman in den Hauptrollen kehrt „Practical Magic 2 – Zauberhafte Schwestern“ in eine Welt zurück, die von schelmischem Zauber im Mondlicht und mächtiger Ahnenmagie geprägt ist. Die Owens-Schwestern müssen sich dem dunklen Fluch stellen, der ihre Familie ein für alle Mal zu zerreißen droht.',
      );
      expect(scrapedMovie.runtime).toBe(100);
      expect(scrapedMovie.posterPath).toBe('https://mcs.planetmutlu.com/tmdb/image/uA8ytJv17alSiREcUthbYAdiPCX.jpg');
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-09-12'));

      const moviePerformance = performances[0]!;
      expect(moviePerformance.scrapedMovieId).toBe(scrapedMovie.id);
      expect(moviePerformance.scrapedPerformanceId).toBe('4c339fe8-e78c-4dbc-b90e-2136ecaa8df2-959582');
      expect(moviePerformance.theatre).toBe('Saal 3');
      expect(moviePerformance.seatingDeepLink).toBe(
        'https://kinoapi.dieselkino.at/?performanceId=959582d&cinemaNumber=04',
      );
      expect(moviePerformance.showtime).toEqual(dayjs.utc(1782924300000).toDate());
      expect(moviePerformance.movieId).toBeNull();

      const attributeSeatClass = attributes.find((attribute) => attribute.category === AttributeCategory.SeatClass);
      const attributeTechnical = attributes.find((attribute) => attribute.category === AttributeCategory.Technical);

      expect(attributeSeatClass?.category).toBe(AttributeCategory.SeatClass);
      expect(attributeSeatClass?.key).toBe('5');
      expect(attributeSeatClass?.name).toBe('VIP Plus');

      expect(attributeTechnical?.category).toBe(AttributeCategory.Technical);
      expect(attributeTechnical?.key).toBe('2d');
      expect(attributeTechnical?.name).toBe('2D');

      for (const performanceAttribute of performancesAttributes) {
        expect(performanceAttribute.performanceId).toBe(moviePerformance.id);
        expect(performanceAttribute.attributeId).toBeOneOf(attributes.map(({ id }) => id));
      }
    });
  });

  describe('when a insert for a movie fails', () => {
    it('does not affect other movies', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesMultipleMockData));
      const transactionSpy = spyOn(db, 'transaction').mockRejectedValueOnce(Error('Mocked error'));

      const job = await queue.add(
        crypto.randomUUID(),
        {},
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://gleisdorf.dieselkino.at');
      expect(transactionSpy).toHaveBeenCalledTimes(2);

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toBeEmpty();

      const scrapedMovies = await db.select().from(scrapedMoviesTable);
      const scrapedMovieAttributes = await db.select({ count: count() }).from(scrapedMoviesToAttributesTable);
      const attributes = await db.select({ count: count() }).from(attributesTable);
      const performances = await db.select({ count: count() }).from(moviePerformancesTable);
      const performancesAttributes = await db.select({ count: count() }).from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes[0]?.count).toBe(0);
      expect(performances[0]?.count).toBe(0);
      expect(performancesAttributes[0]?.count).toBe(0);
      expect(attributes[0]?.count).toBe(0);

      const scrapedMovie = scrapedMovies[0]!;
      expect(scrapedMovie.scrapedMovieId).toBe('f3214991-cc8a-40f8-9f4f-0200714dbcd9');
      expect(scrapedMovie.title).toBe('Clayface');
      expect(scrapedMovie.originalTitle).toBe('Clayface');
      expect(scrapedMovie.description).toBe(
        '„Clayface“ schildert den erschütternden Niedergang eines Mannes vom aufstrebenden Hollywood-Star zum von Rachegelüsten getriebenen Monster. Die Geschichte erzählt vom Verlust der eigenen Identität und Menschlichkeit, von der zerstörerischen Kraft der Liebe und von der Schattenseite wissenschaftlichen Ehrgeizes.',
      );
      expect(scrapedMovie.runtime).toBe(90);
      expect(scrapedMovie.posterPath).toBe('https://mcs.planetmutlu.com/tmdb/image/5jCpQnWPikggmQZoDp1eAi6BI6w.jpg');
      expect(scrapedMovie.availableAt).toEqual(new Date('2026-10-24'));
    });

    it('only updates non-ID properties if the same data is scraped multiple times', async () => {
      const mockedUpdatedAtTimestamp = dayjs.utc('2026-08-15 13:03:41.662+00').toDate();
      const mockedAvailableAtTimestamp = dayjs.utc('2020-09-12').toDate();
      const mockedShowtimeTimestamp = dayjs.utc('2020-07-01 16:20:00+00').toDate();

      await db.insert(scrapedMoviesTable).values([
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          scrapedMovieId: 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45',
          title: 'mocked',
          originalTitle: 'mocked',
          description: 'mocked',
          runtime: 20,
          posterPath: 'mocked',
          availableAt: mockedAvailableAtTimestamp,
          createdAt: dayjs.utc('2026-08-15 13:03:41.662+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
      ]);
      await db.insert(attributesTable).values([
        {
          id: 'f18c77a9-630e-41de-86e7-900122be9ffc',
          category: AttributeCategory.Genres,
          name: 'mocked',
          key: 'Fantasy',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
        {
          id: 'd169ee35-aefa-4c63-8519-f8ea2a2a128a',
          category: AttributeCategory.Genres,
          name: 'mocked',
          key: 'Drama',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
        {
          id: '2ddd2bb1-42a6-40c2-9691-01ef73c5b236',
          category: AttributeCategory.Genres,
          name: 'mocked',
          key: 'Komödie',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
        {
          id: '7dea6b6a-e553-4dea-8448-4ef1e753e196',
          category: AttributeCategory.SeatClass,
          name: 'mocked',
          key: '5',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
        {
          id: '0f7e599d-cac8-4fb8-aab8-1c7cc69ce3fd',
          category: AttributeCategory.Technical,
          name: 'mocked',
          key: '2d',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
        {
          id: '3cce3d6e-ce4d-4faf-9e16-4c59628b702e',
          category: AttributeCategory.Technical,
          name: 'mocked',
          key: '_pm_preview',
          createdAt: dayjs.utc('2026-08-15 13:03:41.657+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
      ]);
      await db.insert(moviePerformancesTable).values([
        {
          id: '7778f692-3e42-4e70-993f-c4b0abdbd2aa',
          scrapedPerformanceId: '4c339fe8-e78c-4dbc-b90e-2136ecaa8df2-959582',
          theatre: 'mocked',
          seatingDeepLink: 'mocked',
          showtime: mockedShowtimeTimestamp,
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          movieId: null,
          createdAt: dayjs.utc('2026-08-15 13:03:41.659+00').toDate(),
          updatedAt: mockedUpdatedAtTimestamp,
        },
      ]);
      await db.insert(moviePerformancesToAttributesTable).values([
        { performanceId: '7778f692-3e42-4e70-993f-c4b0abdbd2aa', attributeId: '7dea6b6a-e553-4dea-8448-4ef1e753e196' },
        { performanceId: '7778f692-3e42-4e70-993f-c4b0abdbd2aa', attributeId: '0f7e599d-cac8-4fb8-aab8-1c7cc69ce3fd' },
      ]);
      await db.insert(scrapedMoviesToAttributesTable).values([
        {
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          attributeId: 'f18c77a9-630e-41de-86e7-900122be9ffc',
        },
        {
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          attributeId: 'd169ee35-aefa-4c63-8519-f8ea2a2a128a',
        },
        {
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          attributeId: '2ddd2bb1-42a6-40c2-9691-01ef73c5b236',
        },
        {
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          attributeId: '0f7e599d-cac8-4fb8-aab8-1c7cc69ce3fd',
        },
        {
          scrapedMovieId: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
          attributeId: '3cce3d6e-ce4d-4faf-9e16-4c59628b702e',
        },
      ]);

      const spy = spyOn(globalThis, 'fetch').mockResolvedValue(getScrapedDataResponse(fullDatasetMockData));

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
      const scrapedMovieAttributes = await db.select().from(scrapedMoviesToAttributesTable);
      const attributes = await db.select().from(attributesTable);
      const performances = await db.select().from(moviePerformancesTable);
      const performancesAttributes = await db.select().from(moviePerformancesToAttributesTable);

      expect(scrapedMovies).toHaveLength(1);
      expect(scrapedMovieAttributes).toHaveLength(5);
      expect(performances).toHaveLength(1);
      expect(performancesAttributes).toHaveLength(2);
      expect(attributes).toHaveLength(6);

      for (const attribute of attributes) {
        expect(attribute.name).not.toBe('mocked');
        expect(attribute.updatedAt).not.toBe(mockedUpdatedAtTimestamp);
      }

      expect(scrapedMovies[0]?.title).not.toBe('mocked');
      expect(scrapedMovies[0]?.originalTitle).not.toBe('mocked');
      expect(scrapedMovies[0]?.description).not.toBe('mocked');
      expect(scrapedMovies[0]?.runtime).not.toBe(20);
      expect(scrapedMovies[0]?.posterPath).not.toBe('mocked');
      expect(scrapedMovies[0]?.availableAt).not.toBe(mockedAvailableAtTimestamp);
      expect(scrapedMovies[0]?.updatedAt).not.toBe(mockedUpdatedAtTimestamp);

      expect(performances[0]?.theatre).not.toBe('mocked');
      expect(performances[0]?.seatingDeepLink).not.toBe('mocked');
      expect(performances[0]?.showtime).not.toBe(mockedShowtimeTimestamp);
      expect(performances[0]?.updatedAt).not.toBe(mockedUpdatedAtTimestamp);
    });
  });
});
