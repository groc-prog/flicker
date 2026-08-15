import { afterEach, describe, expect, it, spyOn, vi } from 'bun:test';
import dayjs from 'dayjs';
import { count } from 'drizzle-orm';

import db from '@flicker/database';
import { AttributeCategory, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/cinema-data-scraping';
import attributesAllCategories from '../../fixtures/data/attributes-all-categories.json';
import moviesMultiple from '../../fixtures/data/movies-multiple.json';
import moviesOptionalPropertiesInvalid from '../../fixtures/data/movies-optional-properties-invalid.json';
import moviesOptionalPropertiesMissing from '../../fixtures/data/movies-optional-properties-missing.json';
import moviesWithAttributes from '../../fixtures/data/movies-with-attributes.json';
import moviesWithPerformancesAndPerformanceAttributes from '../../fixtures/data/movies-with-performances-and-performance-attributes.json';
import moviesWithPerformances from '../../fixtures/data/movies-with-performances.json';
import moviesWithoutRelations from '../../fixtures/data/movies-without-relations.json';
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
  describe('when the scraped attributes contain valid data', () => {
    it('inserts attributes from all tracked categories', async () => {
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(attributesAllCategories));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
        getScrapedDataResponse(moviesOptionalPropertiesMissing),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
        getScrapedDataResponse(moviesOptionalPropertiesInvalid),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesWithoutRelations));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesWithAttributes));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesWithPerformances));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
        getScrapedDataResponse(moviesWithPerformancesAndPerformanceAttributes),
      );

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(getScrapedDataResponse(moviesMultiple));
      const transactionSpy = spyOn(db, 'transaction').mockRejectedValueOnce(Error('Mocked error'));

      const job = await queue.add(crypto.randomUUID(), undefined, {
        attempts: 1,
      });

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
  });
});
