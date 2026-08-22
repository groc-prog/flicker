import { SpanStatusCode, trace } from '@opentelemetry/api';
import dayjs from 'dayjs';
import { eq, sql, type InferSelectModel } from 'drizzle-orm';

import db from '@flicker/database';
import { MovieLanguage, movieLanguageEnum } from '@flicker/database/schemas/enums';
import { moviesTable, type MovieTranslationVideo } from '@flicker/database/schemas/movies';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { attachWorkerEventLogging, logger } from '../telemetry/logging';
import type { operations } from '../types/tmdb-api';
import { movieProcessingGroup } from './groups';

export interface TmdbMetadataJob {
  id: InferSelectModel<typeof scrapedMoviesTable>['id'];
}

type ScrapedMovie = Pick<
  InferSelectModel<typeof scrapedMoviesTable>,
  'title' | 'originalTitle' | 'description' | 'runtime' | 'posterPath' | 'availableAt' | 'id'
>;

type SearchMovieQueryParameters = operations['search-movie']['parameters']['query'];
type SearchMovieResponseBody = operations['search-movie']['responses']['200']['content']['application/json'];
type MovieDetailsQueryParameters = operations['movie-details']['parameters']['query'];
type MovieDetailsResponseBody = operations['movie-details']['responses']['200']['content']['application/json'] & {
  videos?: operations['movie-videos']['responses']['200']['content']['application/json'];
};

const identifier = 'get-tmdb-metadata';
const tracer = trace.getTracer(`worker.${identifier}`);
const tmdbApiBaseUrl = 'https://api.themoviedb.org/3';

export const queue = movieProcessingGroup.getQueue<TmdbMetadataJob>(identifier, {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});
queue.setGlobalRateLimit(10, 1000);
queue.setGlobalConcurrency(10);

export const worker = movieProcessingGroup.getWorker<TmdbMetadataJob>(
  identifier,
  async (job) => {
    await tracer.startActiveSpan(
      `${identifier} process`,
      {
        attributes: {
          [TelemetryIdentifier.WorkerJobId]: job.id,
          [TelemetryIdentifier.WorkerJobName]: job.name,
        },
      },
      async (span) => {
        try {
          await withLogContext({ [TelemetryIdentifier.MovieId]: job.data.id }, async () => {
            if (!process.env.TMDB_API_TOKEN) throw new Error('TMDB_API_TOKEN not defined in environment');

            logger.info(`Getting TMDB metadata for scraped movie ${job.data.id}`);
            const [scrapedMovie] = await db
              .select({
                id: scrapedMoviesTable.id,
                title: scrapedMoviesTable.title,
                originalTitle: scrapedMoviesTable.originalTitle,
                description: scrapedMoviesTable.description,
                runtime: scrapedMoviesTable.runtime,
                posterPath: scrapedMoviesTable.posterPath,
                availableAt: scrapedMoviesTable.availableAt,
              })
              .from(scrapedMoviesTable)
              .where(eq(scrapedMoviesTable.id, job.data.id));

            if (!scrapedMovie) throw new Error(`Scraped movie ${job.data.id} not found`);
            if (!scrapedMovie.originalTitle) {
              logger.warn(`Movies does not have a original title, falling back to scraped values`);
              await storeFallbackValues(scrapedMovie);
              return;
            }

            const movieMetadata = await getTmdbMetadata(scrapedMovie);
            if (!movieMetadata) {
              await storeFallbackValues(scrapedMovie);
              return;
            }

            logger.info(`Fetching movie details for ${movieLanguageEnum.enumValues.length} languages`);
            for (const language of movieLanguageEnum.enumValues) {
              await storeMovieDetailsForLanguage(movieMetadata.id, language as MovieLanguage, scrapedMovie);
            }
          });
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
          });

          throw error;
        } finally {
          span.end();
        }
      },
    );
  },
  {
    embedded: true,
    dataPath: process.env.BUNQUEUE_DATA_PATH,
  },
);
attachWorkerEventLogging(worker);

async function storeFallbackValues(scrapedMovie: ScrapedMovie): Promise<void> {
  logger.info(`Inserting scraped data as movie metadata and german translations`);
  await db
    .insert(moviesTable)
    .values({
      language: MovieLanguage.German,
      title: scrapedMovie.title,
      description: scrapedMovie.description,
      posterPath: scrapedMovie.posterPath,
      runtime: scrapedMovie.runtime,
      availableAt: scrapedMovie.availableAt,
      scrapedMovieId: scrapedMovie.id,
    })
    .onConflictDoUpdate({
      target: [moviesTable.scrapedMovieId, moviesTable.language],
      set: {
        title: sql.raw(`excluded.${moviesTable.title.name}`),
        description: sql.raw(`excluded.${moviesTable.description.name}`),
        posterPath: sql.raw(`excluded.${moviesTable.posterPath.name}`),
        runtime: sql.raw(`excluded.${moviesTable.runtime.name}`),
        availableAt: sql.raw(`excluded.${moviesTable.availableAt.name}`),
      },
    });
  logger.info(`Fallback values for movie ${scrapedMovie.id} inserted successfully`);
}

async function getTmdbMetadata(
  scrapedMovie: ScrapedMovie,
): Promise<NonNullable<SearchMovieResponseBody['results']>[number] | null> {
  logger.info(`Checking if movie ${scrapedMovie.id} exists in TMDB database`);
  const tmdbIdQueryParams: SearchMovieQueryParameters = {
    // Non-null assertion ok since this is checked before this function is called
    query: scrapedMovie.originalTitle!,
    include_adult: true,
    page: 1,
    // Add a small buffer in case the cinema gets the release later than normal
    primary_release_year: dayjs(scrapedMovie.availableAt).subtract(2, 'week').get('year').toString(),
  };

  const tmdbIdUrl = `${tmdbApiBaseUrl}/search/movie?${toUrlSearchParams(tmdbIdQueryParams)}`;
  const tmdbIdResponse = await fetch(tmdbIdUrl, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
    },
  });

  if (!tmdbIdResponse.ok) {
    throw new Error(
      `Request to ${tmdbIdUrl} failed with status (${tmdbIdResponse.status}) ${tmdbIdResponse.statusText}`,
    );
  }
  const data = (await tmdbIdResponse.json()) as SearchMovieResponseBody;

  if (!data.results || !data.results[0]) {
    logger.warn(`No result found for original title in TMDB database, falling back to default values`);
    return null;
  }

  return data.results[0];
}

async function storeMovieDetailsForLanguage(
  tmdbId: number,
  language: MovieLanguage,
  scrapedMovie: ScrapedMovie,
): Promise<void> {
  await tracer.startActiveSpan(
    'getTranslationMetadata',
    {
      attributes: {
        [TelemetryIdentifier.MovieLanguage]: language,
      },
    },
    async (span) => {
      await withLogContext({ [TelemetryIdentifier.MovieLanguage]: language }, async () => {
        try {
          const queryParams: MovieDetailsQueryParameters = {
            append_to_response: 'videos',
            language: language,
          };
          const url = `${tmdbApiBaseUrl}/movie/${tmdbId}?${toUrlSearchParams(queryParams)}`;

          logger.info(`Fetching TMDB movie details for TMDB movie ID ${tmdbId} from ${url}`);
          span.setAttribute('tmdb.api_url', url);

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
            },
          });

          if (!response.ok) {
            const error = new Error(`Request to ${url} failed with status ${response.statusText}`);
            logger.error({ err: error });
            throw error;
          }

          const movieMetadata = (await response.json()) as MovieDetailsResponseBody;

          // Ensure the Api returned all the data which we see as required
          if (!movieMetadata.title) throw new Error('TMDB Api did not return a title property');

          logger.info('Storing movie metadata');
          await db
            .insert(moviesTable)
            .values({
              tmdbId,
              language,
              title: movieMetadata.title,
              description: movieMetadata.overview,
              posterPath: movieMetadata.poster_path,
              videos: movieMetadata.videos?.results?.reduce((collected, video) => {
                if (
                  !video.id ||
                  !video.name ||
                  !video.key ||
                  !video.site ||
                  !video.size ||
                  !video.type ||
                  video.official == undefined
                )
                  return collected;

                collected.push({
                  id: video.id,
                  name: video.name,
                  key: video.key,
                  site: video.site,
                  quality: video.size,
                  type: video.type,
                  official: video.official,
                });
                return collected;
              }, [] as MovieTranslationVideo[]),
              homepage: movieMetadata.homepage,
              budget: movieMetadata.budget,
              revenue: movieMetadata.revenue,
              adult: movieMetadata.adult,
              originalLanguage: movieMetadata.original_language,
              popularity: movieMetadata.popularity,
              runtime: movieMetadata.runtime,
              voteAverage: movieMetadata.vote_average,
              voteCount: movieMetadata.vote_count,
              availableAt: scrapedMovie.availableAt,
              scrapedMovieId: scrapedMovie.id,
            })
            .onConflictDoUpdate({
              target: [moviesTable.scrapedMovieId, moviesTable.language],
              set: {
                tmdbId: sql.raw(`excluded.${moviesTable.tmdbId.name}`),
                title: sql.raw(`excluded.${moviesTable.title.name}`),
                description: sql.raw(`excluded.${moviesTable.description.name}`),
                posterPath: sql.raw(`excluded.${moviesTable.posterPath.name}`),
                videos: sql.raw(`excluded.${moviesTable.videos.name}`),
                homepage: sql.raw(`excluded.${moviesTable.homepage.name}`),
                budget: sql.raw(`excluded.${moviesTable.budget.name}`),
                revenue: sql.raw(`excluded.${moviesTable.revenue.name}`),
                adult: sql.raw(`excluded.${moviesTable.adult.name}`),
                originalLanguage: sql.raw(`excluded.${moviesTable.originalLanguage.name}`),
                popularity: sql.raw(`excluded.${moviesTable.popularity.name}`),
                runtime: sql.raw(`excluded.${moviesTable.runtime.name}`),
                voteAverage: sql.raw(`excluded.${moviesTable.voteAverage.name}`),
                voteCount: sql.raw(`excluded.${moviesTable.voteCount.name}`),
                availableAt: sql.raw(`excluded.${moviesTable.availableAt.name}`),
              },
            });
          logger.info('Movie stored successfully');
        } catch (error) {
          // If fetching the german metadata fails, we fall back to scraped data to ensure there is always
          // at least german metadata present (as english might fail as well)
          if (language === MovieLanguage.German) {
            logger.warn(`TMDB metadata for language ${language} unavailable, falling back to scraped values`);
            await storeFallbackValues(scrapedMovie);
            return;
          }

          logger.error(error, `Failed to fetch metadata for TMDB record ${tmdbId} for language ${language}`);

          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
          });
        } finally {
          span.end();
        }
      });
    },
  );
}

function toUrlSearchParams<T extends object & { length?: never }>(obj: T) {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      queryParams.append(key, value);
      continue;
    }

    queryParams.append(key, `${value}`);
  }

  return queryParams;
}
