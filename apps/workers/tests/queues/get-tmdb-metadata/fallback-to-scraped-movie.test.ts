import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import dayjs from 'dayjs';

import db from '@flicker/database';
import { MovieLanguage } from '@flicker/database/schemas/enums';
import { moviesTable } from '@flicker/database/schemas/movies';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

import { queue, worker } from '../../../src/queues/get-tmdb-metadata';
import { waitForJobCompletion, waitForJobFailure } from '../../fixtures/queue';

const movieMetadataMock = {
  id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
  scrapedMovieId: 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45',
  title: 'Practical Magic 2 - Zauberhafte Schwestern',
  originalTitle: 'Practical Magic 2',
  description:
    'Mit Sandra Bullock und Nicole Kidman in den Hauptrollen kehrt „Practical Magic 2 – Zauberhafte Schwestern“ in eine Welt zurück, die von schelmischem Zauber im Mondlicht und mächtiger Ahnenmagie geprägt ist. Die Owens-Schwestern müssen sich dem dunklen Fluch stellen, der ihre Familie ein für alle Mal zu zerreißen droht.',
  runtime: 100,
  posterPath: 'https://mcs.planetmutlu.com/tmdb/image/uA8ytJv17alSiREcUthbYAdiPCX.jpg',
  availableAt: dayjs.utc('2026-09-11').toDate(),
  createdAt: dayjs.utc('2026-08-15 13:03:41.662+00').toDate(),
  updatedAt: dayjs.utc('2026-08-15 13:03:41.662+00').toDate(),
};

describe('get-tmdb-metadata worker', () => {
  const originalEnv = process.env.TMDB_API_TOKEN;

  beforeAll(() => {
    process.env.TMDB_API_TOKEN = 'mocked-api-token';
  });

  afterAll(() => {
    process.env.TMDB_API_TOKEN = originalEnv;
  });

  describe('when the TMDB movie search is not successful', () => {
    it('falls back to the scraped movie if no original title is defined', async () => {
      const movieMock = {
        ...movieMetadataMock,
        originalTitle: null,
      };
      await db.insert(scrapedMoviesTable).values([movieMock]);

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(1);

      const movie = movies[0]!;
      expect(movie.tmdbId).toBeNull();
      expect(movie.language).toBe(MovieLanguage.German);
      expect(movie.title).toBe(movieMock.title);
      expect(movie.description).toBe(movieMock.description);
      expect(movie.posterPath).toBe(movieMock.posterPath);
      expect(movie.videos).toBeNull();
      expect(movie.homepage).toBeNull();
      expect(movie.budget).toBeNull();
      expect(movie.revenue).toBeNull();
      expect(movie.adult).toBeNull();
      expect(movie.originalLanguage).toBeNull();
      expect(movie.popularity).toBeNull();
      expect(movie.runtime).toBe(movieMock.runtime);
      expect(movie.voteAverage).toBeNull();
      expect(movie.voteCount).toBeNull();
      expect(movie.availableAt).toEqual(movieMock.availableAt);
      expect(movie.scrapedMovieId).toBe(movieMock.id);
    });

    it('throws when the TMDB search request fails', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 500,
          statusText: 'Internal server error',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      const error = await waitForJobFailure(worker, job.id);
      expect(error.message).toBe(
        `Request to https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026 failed with status (500) Internal server error`,
      );

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(1);
      expect(dlqEntries[0]?.job.id).toBe(job.id);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(0);
    });

    it('falls back to the scraped movie if the response is empty', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(1);

      const movie = movies[0]!;
      expect(movie.tmdbId).toBeNull();
      expect(movie.language).toBe(MovieLanguage.German);
      expect(movie.title).toBe(movieMetadataMock.title);
      expect(movie.description).toBe(movieMetadataMock.description);
      expect(movie.posterPath).toBe(movieMetadataMock.posterPath);
      expect(movie.videos).toBeNull();
      expect(movie.homepage).toBeNull();
      expect(movie.budget).toBeNull();
      expect(movie.revenue).toBeNull();
      expect(movie.adult).toBeNull();
      expect(movie.originalLanguage).toBeNull();
      expect(movie.popularity).toBeNull();
      expect(movie.runtime).toBe(movieMetadataMock.runtime);
      expect(movie.voteAverage).toBeNull();
      expect(movie.voteCount).toBeNull();
      expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
      expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
    });

    it('falls back to the scraped movie if the movie is not found in the search', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(1);

      const movie = movies[0]!;
      expect(movie.tmdbId).toBeNull();
      expect(movie.language).toBe(MovieLanguage.German);
      expect(movie.title).toBe(movieMetadataMock.title);
      expect(movie.description).toBe(movieMetadataMock.description);
      expect(movie.posterPath).toBe(movieMetadataMock.posterPath);
      expect(movie.videos).toBeNull();
      expect(movie.homepage).toBeNull();
      expect(movie.budget).toBeNull();
      expect(movie.revenue).toBeNull();
      expect(movie.adult).toBeNull();
      expect(movie.originalLanguage).toBeNull();
      expect(movie.popularity).toBeNull();
      expect(movie.runtime).toBe(movieMetadataMock.runtime);
      expect(movie.voteAverage).toBeNull();
      expect(movie.voteCount).toBeNull();
      expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
      expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
    });
  });

  describe('when the TMDB movie details request is not successful', () => {
    it('falls back to the scraped movie with language german when the TMDB movie details request fails', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ id: 1 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValue(
          new Response(JSON.stringify({}), {
            status: 500,
            statusText: 'Internal server error',
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=de',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        3,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=en',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(1);

      const movie = movies[0]!;
      expect(movie.tmdbId).toBeNull();
      expect(movie.language).toBe(MovieLanguage.German);
      expect(movie.title).toBe(movieMetadataMock.title);
      expect(movie.description).toBe(movieMetadataMock.description);
      expect(movie.posterPath).toBe(movieMetadataMock.posterPath);
      expect(movie.videos).toBeNull();
      expect(movie.homepage).toBeNull();
      expect(movie.budget).toBeNull();
      expect(movie.revenue).toBeNull();
      expect(movie.adult).toBeNull();
      expect(movie.originalLanguage).toBeNull();
      expect(movie.popularity).toBeNull();
      expect(movie.runtime).toBe(movieMetadataMock.runtime);
      expect(movie.voteAverage).toBeNull();
      expect(movie.voteCount).toBeNull();
      expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
      expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
    });

    it('falls back to the scraped movie with language german when the TMDB movie details request returns a unexpected result', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ id: 1 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValue(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=de',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        3,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=en',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(1);

      const movie = movies[0]!;
      expect(movie.tmdbId).toBeNull();
      expect(movie.language).toBe(MovieLanguage.German);
      expect(movie.title).toBe(movieMetadataMock.title);
      expect(movie.description).toBe(movieMetadataMock.description);
      expect(movie.posterPath).toBe(movieMetadataMock.posterPath);
      expect(movie.videos).toBeNull();
      expect(movie.homepage).toBeNull();
      expect(movie.budget).toBeNull();
      expect(movie.revenue).toBeNull();
      expect(movie.adult).toBeNull();
      expect(movie.originalLanguage).toBeNull();
      expect(movie.popularity).toBeNull();
      expect(movie.runtime).toBe(movieMetadataMock.runtime);
      expect(movie.voteAverage).toBeNull();
      expect(movie.voteCount).toBeNull();
      expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
      expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
    });
  });

  describe('when all TMDB requests are successful', () => {
    it('stores movies for all languages', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);

      const spy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ id: 1 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              title: 'mocked-title-de',
              overview: 'mocked-description-de',
              poster_path: 'mocked-poster-path-de',
              videos: null,
              homepage: 'mocked-homepage-de',
              budget: 1000000,
              revenue: 1000000,
              adult: true,
              original_language: 'mocked-original-language-de',
              runtime: 120,
              popularity: 120.31,
              vote_average: 8.5,
              vote_count: 231,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              title: 'mocked-title-en',
              overview: 'mocked-description-en',
              poster_path: 'mocked-poster-path-en',
              videos: null,
              homepage: 'mocked-homepage-en',
              budget: 2000000,
              revenue: 2000000,
              adult: false,
              original_language: 'mocked-original-language-en',
              runtime: 140,
              popularity: 140.31,
              vote_average: 8.7,
              vote_count: 431,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=de',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        3,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=en',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(2);

      expect(movies.filter(({ language }) => language === MovieLanguage.German)).toHaveLength(1);
      expect(movies.filter(({ language }) => language === MovieLanguage.English)).toHaveLength(1);

      for (const movie of movies) {
        if (movie.language === MovieLanguage.German) {
          expect(movie.tmdbId).toBe(1);
          expect(movie.title).toBe('mocked-title-de');
          expect(movie.description).toBe('mocked-description-de');
          expect(movie.posterPath).toBe('mocked-poster-path-de');
          expect(movie.videos).toBeNull();
          expect(movie.homepage).toBe('mocked-homepage-de');
          expect(movie.budget).toBe(1000000);
          expect(movie.revenue).toBe(1000000);
          expect(movie.adult).toBe(true);
          expect(movie.originalLanguage).toBe('mocked-original-language-de');
          expect(movie.popularity).toBe(120.31);
          expect(movie.runtime).toBe(120);
          expect(movie.voteAverage).toBe(8.5);
          expect(movie.voteCount).toBe(231);
          expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
          expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
        } else {
          expect(movie.tmdbId).toBe(1);
          expect(movie.title).toBe('mocked-title-en');
          expect(movie.description).toBe('mocked-description-en');
          expect(movie.posterPath).toBe('mocked-poster-path-en');
          expect(movie.videos).toBeNull();
          expect(movie.homepage).toBe('mocked-homepage-en');
          expect(movie.budget).toBe(2000000);
          expect(movie.revenue).toBe(2000000);
          expect(movie.adult).toBe(false);
          expect(movie.originalLanguage).toBe('mocked-original-language-en');
          expect(movie.popularity).toBe(140.31);
          expect(movie.runtime).toBe(140);
          expect(movie.voteAverage).toBe(8.7);
          expect(movie.voteCount).toBe(431);
          expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
          expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
        }
      }
    });

    it('only stores videos with all the required properties', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);
      const createMockResponse = () =>
        new Response(
          JSON.stringify({
            title: 'mocked-title',
            overview: 'mocked-description',
            poster_path: 'mocked-poster-path',
            homepage: 'mocked-homepage',
            budget: 1000000,
            revenue: 1000000,
            adult: true,
            original_language: 'mocked-original-language',
            runtime: 120,
            popularity: 120.31,
            vote_average: 8.5,
            vote_count: 231,
            videos: {
              results: [
                {
                  id: '1',
                  name: 'v-1',
                  key: 'k-1',
                  site: 's-1',
                  size: 1,
                  type: 't-1',
                  official: true,
                },
                {
                  name: 'v-2',
                  key: 'k-2',
                  site: 's-2',
                  size: 2,
                  type: 't-2',
                  official: true,
                },
                {
                  id: '3',
                  key: 'k-3',
                  site: 's-3',
                  size: 3,
                  type: 't-3',
                  official: true,
                },
                {
                  id: '4',
                  name: 'v-4',
                  site: 's-4',
                  size: 4,
                  type: 't-4',
                  official: true,
                },
                {
                  id: '5',
                  name: 'v-5',
                  key: 'k-5',
                  size: 5,
                  type: 't-5',
                  official: true,
                },
                {
                  id: '6',
                  name: 'v-6',
                  key: 'k-6',
                  site: 's-6',
                  type: 't-6',
                  official: true,
                },
                {
                  id: '7',
                  name: 'v-7',
                  key: 'k-7',
                  site: 's-7',
                  size: 7,
                  official: true,
                },
                {
                  id: '8',
                  name: 'v-8',
                  key: 'k-8',
                  site: 's-8',
                  size: 8,
                  type: 't-8',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );

      const spy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ id: 1 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(createMockResponse())
        .mockResolvedValueOnce(createMockResponse());

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=de',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        3,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=en',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(2);

      expect(movies.filter(({ language }) => language === MovieLanguage.German)).toHaveLength(1);
      expect(movies.filter(({ language }) => language === MovieLanguage.English)).toHaveLength(1);

      for (const movie of movies) {
        expect(movie.videos).toEqual([
          { id: '1', name: 'v-1', key: 'k-1', site: 's-1', quality: 1, type: 't-1', official: true },
        ]);
      }
    });

    it('updates metadata if movie is already stored', async () => {
      await db.insert(scrapedMoviesTable).values([movieMetadataMock]);
      await db.insert(moviesTable).values([
        {
          language: MovieLanguage.German,
          scrapedMovieId: movieMetadataMock.id,
          availableAt: movieMetadataMock.availableAt,
          title: 'existing-title',
          description: 'existing-description',
          posterPath: 'existing-poster-path',
          homepage: 'existing-homepage',
          budget: 6000000,
          revenue: 6000000,
          adult: false,
          originalLanguage: 'existing-original-language',
          runtime: 90,
          popularity: 540.31,
          voteAverage: 4.2,
          voteCount: 346,
          videos: [
            {
              id: 'existing',
              name: 'existing',
              key: 'existing',
              site: 'existing',
              quality: 13532,
              type: 'existing',
              official: false,
            },
          ],
        },
        {
          language: MovieLanguage.English,
          scrapedMovieId: movieMetadataMock.id,
          availableAt: movieMetadataMock.availableAt,
          title: 'existing-title',
          description: 'existing-description',
          posterPath: 'existing-poster-path',
          homepage: 'existing-homepage',
          budget: 6000000,
          revenue: 6000000,
          adult: false,
          originalLanguage: 'existing-original-language',
          runtime: 90,
          popularity: 540.31,
          voteAverage: 4.2,
          voteCount: 346,
          videos: [
            {
              id: 'existing',
              name: 'existing',
              key: 'existing',
              site: 'existing',
              quality: 13532,
              type: 'existing',
              official: false,
            },
          ],
        },
      ]);

      const createMockResponse = () =>
        new Response(
          JSON.stringify({
            title: 'mocked-title',
            overview: 'mocked-description',
            poster_path: 'mocked-poster-path',
            homepage: 'mocked-homepage',
            budget: 1000000,
            revenue: 1000000,
            adult: true,
            original_language: 'mocked-original-language',
            runtime: 120,
            popularity: 120.31,
            vote_average: 8.5,
            vote_count: 231,
            videos: {
              results: [
                {
                  id: '1',
                  name: 'v-1',
                  key: 'k-1',
                  site: 's-1',
                  size: 1,
                  type: 't-1',
                  official: true,
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );

      const spy = spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ id: 1 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(createMockResponse())
        .mockResolvedValueOnce(createMockResponse());

      const job = await queue.add(
        crypto.randomUUID(),
        {
          id: '7578d1ea-ca48-4f1c-ad77-96a40682420d',
        },
        {
          attempts: 1,
        },
      );

      await waitForJobCompletion(worker, job.id);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'https://api.themoviedb.org/3/search/movie?query=Practical+Magic+2&include_adult=true&page=1&primary_release_year=2026',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=de',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );
      expect(spy).toHaveBeenNthCalledWith(
        3,
        'https://api.themoviedb.org/3/movie/1?append_to_response=videos&language=en',
        {
          headers: {
            Authorization: `Bearer mocked-api-token`,
          },
        },
      );

      const dlqEntries = queue.getDlq();
      expect(dlqEntries).toHaveLength(0);

      const movies = await db.select().from(moviesTable);
      expect(movies).toHaveLength(2);

      expect(movies.filter(({ language }) => language === MovieLanguage.German)).toHaveLength(1);
      expect(movies.filter(({ language }) => language === MovieLanguage.English)).toHaveLength(1);

      for (const movie of movies) {
        expect(movie.tmdbId).toBe(1);
        expect(movie.title).toBe('mocked-title');
        expect(movie.description).toBe('mocked-description');
        expect(movie.posterPath).toBe('mocked-poster-path');
        expect(movie.homepage).toBe('mocked-homepage');
        expect(movie.budget).toBe(1000000);
        expect(movie.revenue).toBe(1000000);
        expect(movie.adult).toBe(true);
        expect(movie.originalLanguage).toBe('mocked-original-language');
        expect(movie.popularity).toBe(120.31);
        expect(movie.runtime).toBe(120);
        expect(movie.voteAverage).toBe(8.5);
        expect(movie.voteCount).toBe(231);
        expect(movie.availableAt).toEqual(movieMetadataMock.availableAt);
        expect(movie.scrapedMovieId).toBe(movieMetadataMock.id);
        expect(movie.videos).toEqual([
          { id: '1', name: 'v-1', key: 'k-1', site: 's-1', quality: 1, type: 't-1', official: true },
        ]);
      }
    });
  });
});
