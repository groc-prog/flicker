// import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

// import db from '@flicker/database';
// import { moviesTable } from '@flicker/database/schemas/movies';
// import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';

// import { queue, worker } from '../../../src/queues/get-tmdb-metadata';
// import { waitForJobFailure } from '../../fixtures/queue';

// afterEach(async () => {
//   await queue.obliterateAsync();
//   await db.delete(scrapedMoviesTable);
//   await db.delete(moviesTable);
// });

// describe('get-tmdb-metadata worker', () => {
//   describe('when the job is missing required environment configuration', () => {
//     it('throws when the TMDB_API_TOKEN environment variable is missing', async () => {
//       const job = await queue.add(
//         crypto.randomUUID(),
//         {
//           id: 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45',
//         },
//         {
//           attempts: 1,
//         },
//       );

//       const error = await waitForJobFailure(worker, job.id);
//       expect(error.message).toBe('TMDB_API_TOKEN not defined in environment');

//       const dlqEntries = queue.getDlq();
//       expect(dlqEntries).toHaveLength(1);
//       expect(dlqEntries[0]?.job.id).toBe(job.id);

//       const movies = await db.select().from(moviesTable);

//       expect(movies).toHaveLength(0);
//     });
//   });

//   describe('when the job was provided with a invalid payload', () => {
//     const originalEnv = process.env.TMDB_API_TOKEN;

//     beforeAll(() => {
//       process.env.TMDB_API_TOKEN = 'mocked-api-token';
//     });

//     afterAll(() => {
//       process.env.TMDB_API_TOKEN = originalEnv;
//     });

//     it('throws when the provided scraped movie can not be found', async () => {
//       const mockedMovieId = 'f3e754ef-5e4c-4b0a-9f64-014e9a96af45';
//       const job = await queue.add(
//         crypto.randomUUID(),
//         {
//           id: mockedMovieId,
//         },
//         {
//           attempts: 1,
//         },
//       );

//       const error = await waitForJobFailure(worker, job.id);
//       expect(error.message).toBe(`Scraped movie ${mockedMovieId} not found`);

//       const dlqEntries = queue.getDlq();
//       expect(dlqEntries).toHaveLength(1);
//       expect(dlqEntries[0]?.job.id).toBe(job.id);

//       const movies = await db.select().from(moviesTable);

//       expect(movies).toHaveLength(0);
//     });
//   });
// });
