import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Queue, Worker } from 'bunqueue/client';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { and, eq, gt, inArray, not, sql, type InferInsertModel } from 'drizzle-orm';
import { get, isArray, isPlainObject } from 'lodash';

import db from '@flicker/database';
import { AttributeCategory, attributeCategoryEnum, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { attachWorkerEventLogging, logger } from '../telemetry/logging';
import { queue as tmdbMetadataQueue } from './get-tmdb-metadata';

interface ScrapedData {
  movies?: {
    items?: Record<
      string,
      {
        title?: string;
        origTitle?: string;
        genres?: string[];
        technologyAttributes?: {
          id?: string;
          name?: string;
        }[];
        description?: string;
        length?: number;
        fsk?: number | null;
        startingDate?: string;
        images?: {
          poster?: {
            url?: string;
          };
        };
      }
    >;
  };
  performances?: {
    items?: Record<
      string,
      {
        moviePk?: string;
        deeplinkURL?: string;
        attributes?: {
          id?: string;
          name?: string;
        }[];
        theatreName?: string;
        timeUtc?: number;
        seatClasses?: {
          id?: string;
          name?: string;
        }[];
      }
    >;
  };
  attributes?: Record<
    AttributeCategory,
    Record<
      string,
      {
        name?: string;
        movies?: string[];
        performances?: string[];
      }
    >
  >;
}

interface MappedMovieRelations {
  /** This will contain key paths to the correct attribute in the scraped data. */
  attributes: Set<string>;
  /** The ref IDs of the performances associated with the movie. */
  performances: Set<string>;
}

interface MappedPerformanceRelations {
  /** This will contain key paths to the correct attribute in the scraped data. */
  attributes: Set<string>;
}

type ExtractedAttributes = Omit<InferInsertModel<typeof attributesTable>, 'id' | 'createdAt'>[];

const identifier = 'scrape-cinema-data';
const tracer = trace.getTracer(`worker.${identifier}`);

export const queue = new Queue(identifier, {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});

export const worker = new Worker(
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
          const data = await scrapeHtmlContent();
          const [movieRelations, performanceRelations, extractedAttributes] = buildEntityMaps(data);

          const attributeIdMap = await storeAttributes(extractedAttributes);
          const storedMovieIds = await storeMovies(data, attributeIdMap, movieRelations, performanceRelations);

          scheduleFollowUpJobs(storedMovieIds);
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
    concurrency: 1,
  },
);
attachWorkerEventLogging(worker);

async function scrapeHtmlContent(): Promise<ScrapedData> {
  const cinemaUrl = 'https://gleisdorf.dieselkino.at';

  return await tracer.startActiveSpan('scrapeHtmlContent', async (span) => {
    try {
      logger.info(`Fetching HTML content from ${cinemaUrl}`);
      const response = await fetch(cinemaUrl);

      if (!response.ok) {
        throw new Error(`Request to ${cinemaUrl} failed with status (${response.status}) ${response.statusText}`);
      }

      const content = await response.text();
      logger.info('HTML content fetched successfully');

      const dataElementIdentifier = '#pmkino-frontpage-script-js-extra';
      return tracer.startActiveSpan(
        'extractDataObjects',
        { attributes: { 'data.content_length': content.length, 'element.identifier': dataElementIdentifier } },
        (span) => {
          try {
            logger.info('Loading HTML content and extracting data');
            const $ = cheerio.load(content);
            const unparsedData = $(dataElementIdentifier).text();

            // The data is available as the value assigned to a specific JS variable
            // This is the only content in the script, meaning we can get the first and last curly
            // braces to extract the whole JSON object
            const jsonDataStart = unparsedData.indexOf('{');
            const jsonDataEnd = unparsedData.lastIndexOf('}');

            if (jsonDataStart === -1 || jsonDataEnd === -1) throw new Error('JSON data not found in unparsed data');

            const payloadLength = jsonDataEnd + 1 - jsonDataStart;
            span.setAttribute('data.extracted_length', payloadLength);

            const jsonSerializedData = unparsedData.slice(jsonDataStart, jsonDataEnd + 1);
            logger.debug(`Content string parsed from indexes ${jsonDataStart} to ${jsonDataStart}`);
            logger.info('Stringified JSON data extracted successfully, attempting to parse data into JSON object');
            const parsedData = JSON.parse(jsonSerializedData);

            if (!('apiData' in parsedData))
              throw new Error(
                'apiData key not found in parsed data. This might indicate that the embedded data has changed',
              );

            const { apiData } = parsedData;
            if (!isPlainObject(apiData))
              throw new Error(
                'Value for apiData key is not an object. This might indicate that the embedded data has changed',
              );

            logger.info('JSON data parsed successfully, returning relevant subset of data');
            return apiData as ScrapedData;
          } catch (error) {
            logger.error(error, 'Data can not be extracted due to unexpected structure');

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
    } finally {
      span.end();
    }
  });
}

function buildEntityMaps(
  data: ScrapedData,
): [Map<string, MappedMovieRelations>, Map<string, MappedPerformanceRelations>, ExtractedAttributes] {
  logger.info('Building data map for movie metadata lookup');
  const movieRelations = new Map<string, MappedMovieRelations>();
  const performanceRelations = new Map<string, MappedPerformanceRelations>();
  const extractedAttributes: ExtractedAttributes = [];

  tracer.startActiveSpan('buildRelationMaps', (span) => {
    try {
      logger.debug('Validating object structure for relevant properties');
      if (!('movies' in data))
        throw new Error('movies key not found in parsed data. This might indicate that the embedded data has changed');
      if (!('performances' in data))
        throw new Error(
          'performances key not found in parsed data. This might indicate that the embedded data has changed',
        );
      if (!('attributes' in data))
        throw new Error(
          'attributes key not found in parsed data. This might indicate that the embedded data has changed',
        );

      const movies = get(data, 'movies.items', null);
      const performances = get(data, 'performances.items', null);
      const attributes = get(data, 'attributes', null);

      if (!movies || !isPlainObject(movies))
        throw new Error(
          'Value for movies key is not an object. This might indicate that the embedded data has changed',
        );
      if (!performances || !isPlainObject(performances))
        throw new Error(
          'Value for performances key is not an object. This might indicate that the embedded data has changed',
        );
      if (!attributes || !isPlainObject(attributes))
        throw new Error(
          'Value for attributes key is not an object. This might indicate that the embedded data has changed',
        );

      // Each attribute and performance defines which movie it belongs to on it's own data
      // We build a map for all movies so we can later insert all movies and it's relations to
      // attributes/performances in on transaction per movie
      logger.info(`Building lookup map for ${Object.keys(movies).length} movies`);
      for (const movieRefId of Object.keys(movies)) {
        movieRelations.set(movieRefId, {
          attributes: new Set<string>(),
          performances: new Set<string>(),
        });
      }

      logger.debug(`Adding ${Object.keys(performances).length} performances to map`);
      for (const [performanceRefId, performanceData] of Object.entries(performances)) {
        withLogContext({ [TelemetryIdentifier.PerformanceRefId]: performanceRefId }, () => {
          const { moviePk } = performanceData;
          if (!moviePk) {
            logger.warn(`Performance ${performanceRefId} does not define a moviePk property, skipping`);
            return;
          }

          // The scraped data can be funky at times, so we need to double check everything
          if (!movieRelations.has(moviePk)) {
            logger.warn(`Performance ${performanceRefId} defines unknown movie ref ID ${moviePk}, skipping`);
            return;
          }

          logger.debug(`Found matching movie ref ID for movie ${moviePk} and performance ${performanceRefId}`);
          const relations = movieRelations.get(moviePk)!;
          relations.performances.add(performanceRefId);
        });
      }

      logger.debug('Adding attributes to map');
      for (const [attributeCategory, attributeCategoryValues] of Object.entries(attributes)) {
        withLogContext({ [TelemetryIdentifier.AttributeCategory]: attributeCategory }, () => {
          if (!attributeCategoryEnum.enumValues.includes(attributeCategory)) {
            logger.debug(`Unknown attribute category ${attributeCategory}, skipping`);
            return;
          }
          if (!isPlainObject(attributeCategoryValues)) {
            logger.warn(`Values for attribute category ${attributeCategory} is not a object, skipping`);
            return;
          }

          for (const [attributeKey, attributeData] of Object.entries(attributeCategoryValues)) {
            withLogContext({ [TelemetryIdentifier.AttributeKey]: attributeKey }, () => {
              if (!attributeData.name || typeof attributeData.name !== 'string') {
                logger.warn(
                  `Attribute name for attribute ${attributeKey} in category ${attributeCategory} is not a string, skipping`,
                );
                return;
              }

              extractedAttributes.push({
                name: attributeData.name,
                category: attributeCategory as AttributeCategory,
                key: attributeKey,
              });

              // Some attributes are only available for movies/performances
              if (attributeData.movies && isArray(attributeData.movies)) {
                for (const movieRefId of attributeData.movies) {
                  if (!movieRelations.has(movieRefId)) {
                    logger.warn(
                      `Attribute ${attributeKey} in category ${attributeCategory} defines unknown movie ref ID ${movieRefId}, skipping`,
                    );
                    return;
                  }

                  const movieRelation = movieRelations.get(movieRefId)!;
                  movieRelation.attributes.add(`${attributeCategory}.${attributeKey}`);
                }
              } else {
                logger.debug(`Attribute has no movies associated with it or movies key is not a array, skipping`);
              }

              if (attributeData.performances && isArray(attributeData.performances)) {
                for (const performanceRefId of attributeData.performances) {
                  if (!performanceRelations.has(performanceRefId))
                    performanceRelations.set(performanceRefId, { attributes: new Set<string>() });

                  const performanceRelation = performanceRelations.get(performanceRefId)!;
                  performanceRelation.attributes.add(`${attributeCategory}.${attributeKey}`);
                }
              } else {
                logger.debug(
                  `Attribute has no performances associated with it or performances key is not a array, skipping`,
                );
              }
            });
          }
        });
      }
    } finally {
      span.end();
    }
  });

  logger.info(
    `Built maps for ${extractedAttributes.length} attributes, relations for ${movieRelations.size} movies and relations for ${performanceRelations.size} performances`,
  );
  return [movieRelations, performanceRelations, extractedAttributes];
}

async function storeAttributes(extractedAttributes: ExtractedAttributes): Promise<Map<string, string>> {
  if (extractedAttributes.length === 0) {
    logger.info('No attributes found, skipping');
    return new Map<string, string>();
  }

  logger.info(`Storing ${extractedAttributes.length} attributes`);
  const insertedOrUpdated = await db
    .insert(attributesTable)
    .values(extractedAttributes)
    .onConflictDoUpdate({
      target: [attributesTable.category, attributesTable.key],
      set: {
        name: sql.raw(`excluded.${attributesTable.name.name}`),
      },
    })
    .returning({
      id: attributesTable.id,
      category: attributesTable.category,
      key: attributesTable.key,
    });

  logger.info(`Successfully inserted or updated ${insertedOrUpdated.length} attributes`);
  return new Map(insertedOrUpdated.map(({ id, category, key }) => [`${category}.${key}`, id]));
}

async function storeMovies(
  data: ScrapedData,
  attributeIdMap: Map<string, string>,
  movieRelations: Map<string, MappedMovieRelations>,
  performanceRelations: Map<string, MappedPerformanceRelations>,
): Promise<string[]> {
  logger.info(`Storing ${movieRelations.size} movies and their relations`);
  const storedMovieIds: string[] = [];

  for (const [movieRefId, movieRelation] of movieRelations.entries()) {
    await tracer.startActiveSpan(
      `storeMovie`,
      { attributes: { [TelemetryIdentifier.MovieRefId]: movieRefId } },
      async (span) => {
        await withLogContext({ [TelemetryIdentifier.MovieRefId]: movieRefId }, async () => {
          logger.info(`Storing movie ${movieRefId} and it's relations`);

          try {
            const movieMetadata = get(data, `movies.items.${movieRefId}`);
            if (!movieMetadata) {
              logger.warn(`Movie ${movieRefId} not found in scraped data, skipping`);
              return;
            }

            if (!movieMetadata.title || typeof movieMetadata.title !== 'string') {
              logger.warn(`Movie ${movieRefId} does not have a valid title, skipping`);
              return;
            }
            if (!movieMetadata.startingDate || typeof movieMetadata.startingDate !== 'string') {
              logger.warn(`Movie ${movieRefId} does not have a valid starting date, skipping`);
              return;
            }
            if (!movieMetadata.origTitle || typeof movieMetadata.origTitle !== 'string') {
              logger.warn(
                `Movie ${movieRefId} does not have a valid original title. Original title will not be stored`,
              );
            }
            if (!movieMetadata.description || typeof movieMetadata.description !== 'string') {
              logger.warn(`Movie ${movieRefId} does not have a valid description. Description will not be stored`);
            }
            if (!movieMetadata.length || typeof movieMetadata.length !== 'number') {
              logger.warn(`Movie ${movieRefId} does not have a valid runtime. Runtime will not be stored`);
            }
            if (!movieMetadata.images?.poster?.url || typeof movieMetadata.images?.poster?.url !== 'string') {
              logger.warn(`Movie ${movieRefId} does not have a valid poster path. Poster path will not be stored`);
            }

            const moviePerformances: Omit<
              InferInsertModel<typeof moviePerformancesTable>,
              'id' | 'createdAt' | 'scrapedMovieId'
            >[] = [];
            const moviePerformancesAttributeRelations: (Omit<
              InferInsertModel<typeof moviePerformancesToAttributesTable>,
              'performanceId'
            > & { scrapedPerformanceId: string })[] = [];
            const movieAttributeRelations: Omit<
              InferInsertModel<typeof scrapedMoviesToAttributesTable>,
              'scrapedMovieId'
            >[] = [];
            const movie: Omit<InferInsertModel<typeof scrapedMoviesTable>, 'id' | 'createdAt'> = {
              scrapedMovieId: movieRefId,
              title: movieMetadata.title,
              originalTitle: typeof movieMetadata.origTitle === 'string' ? movieMetadata.origTitle : null,
              description: typeof movieMetadata.description === 'string' ? movieMetadata.description : null,
              runtime: typeof movieMetadata.length === 'number' ? movieMetadata.length : null,
              posterPath:
                typeof movieMetadata.images?.poster?.url === 'string' ? movieMetadata.images?.poster?.url : null,
              availableAt: dayjs(movieMetadata.startingDate).add(1, 'day').toDate(),
            };

            if (movieRelation.attributes.size !== 0) {
              logger.debug(`Preparing ${movieRelation.attributes.size} attribute relations for movies`);
              for (const attributePath of movieRelation.attributes.keys()) {
                const attributeId = attributeIdMap.get(attributePath);
                if (!attributeId) {
                  logger.warn(`No attribute ID for path ${attributePath} found, skipping relation`);
                  continue;
                }

                movieAttributeRelations.push({
                  attributeId,
                });
              }
            }

            if (movieRelation.performances.size !== 0) {
              logger.debug(`Preparing ${movieRelation.performances.size} performance relations`);
              for (const performanceRefId of movieRelation.performances.keys()) {
                const performanceMetadata = get(data, `performances.items.${performanceRefId}`);
                if (!performanceMetadata) {
                  logger.warn(`Performance ${performanceRefId} not found in scraped data, skipping`);
                  continue;
                }

                if (!performanceMetadata.theatreName || typeof performanceMetadata.theatreName !== 'string') {
                  logger.warn(`Performance ${performanceRefId} does not have a valid theatre name, skipping`);
                  continue;
                }
                if (!performanceMetadata.deeplinkURL || typeof performanceMetadata.deeplinkURL !== 'string') {
                  logger.warn(`Performance ${performanceRefId} does not have a valid deeplink URL, skipping`);
                  continue;
                }
                if (!performanceMetadata.timeUtc || typeof performanceMetadata.timeUtc !== 'number') {
                  logger.warn(`Performance ${performanceRefId} does not have a valid showtime, skipping`);
                  continue;
                }

                moviePerformances.push({
                  scrapedPerformanceId: performanceRefId,
                  theatre: performanceMetadata.theatreName,
                  seatingDeepLink: performanceMetadata.deeplinkURL,
                  showtime: dayjs.utc(performanceMetadata.timeUtc).toDate(),
                });
              }
            }

            if (performanceRelations.size !== 0) {
              logger.debug(`Preparing ${performanceRelations.size} attribute relations for performances`);
              for (const [performanceRefId, performanceRelation] of performanceRelations.entries()) {
                if (performanceRelation.attributes.size === 0) {
                  logger.debug(`Performance ${performanceRefId} does not have any attribute relations, skipping`);
                  continue;
                }

                for (const attributePath of performanceRelation.attributes.keys()) {
                  const attributeId = attributeIdMap.get(attributePath);
                  if (!attributeId) {
                    logger.warn(`No attribute ID for path ${attributePath} found, skipping relation`);
                    continue;
                  }

                  moviePerformancesAttributeRelations.push({
                    attributeId,
                    scrapedPerformanceId: performanceRefId,
                  });
                }
              }
            }

            logger.debug(`Opening transaction to store movie ${movieRefId} and relations`);
            const scrapedMovieId = await db.transaction(async (tx) => {
              const [insertedOrUpdatedMovie] = await tx
                .insert(scrapedMoviesTable)
                .values(movie)
                .onConflictDoUpdate({
                  target: scrapedMoviesTable.scrapedMovieId,
                  set: {
                    title: sql.raw(`excluded.${scrapedMoviesTable.title.name}`),
                    originalTitle: sql.raw(`excluded.${scrapedMoviesTable.originalTitle.name}`),
                    description: sql.raw(`excluded.${scrapedMoviesTable.description.name}`),
                    runtime: sql.raw(`excluded.${scrapedMoviesTable.runtime.name}`),
                    posterPath: sql.raw(`excluded.${scrapedMoviesTable.posterPath.name}`),
                    availableAt: sql.raw(`excluded.${scrapedMoviesTable.availableAt.name}`),
                  },
                })
                .returning({ id: scrapedMoviesTable.id });

              if (!insertedOrUpdatedMovie?.id)
                throw new Error('Query did not return inserted or updated scraped movie');

              // Remove any previously inserted attribute relations so only the newest ones are stored
              await tx
                .delete(scrapedMoviesToAttributesTable)
                .where(eq(scrapedMoviesToAttributesTable.scrapedMovieId, insertedOrUpdatedMovie.id));
              if (movieAttributeRelations.length > 0) {
                logger.debug(`Found ${movieAttributeRelations.length} attribute relations for movie ${movieRefId}`);
                await tx
                  .insert(scrapedMoviesToAttributesTable)
                  .values(
                    movieAttributeRelations.map((relation) => ({
                      ...relation,
                      scrapedMovieId: insertedOrUpdatedMovie.id,
                    })),
                  )
                  .onConflictDoNothing();
              }

              if (moviePerformances.length > 0) {
                logger.debug(`Found ${moviePerformances.length} performances relations for movie ${movieRefId}`);
                const insertedOrUpdatedPerformances = await tx
                  .insert(moviePerformancesTable)
                  .values(
                    moviePerformances.map((performance) => ({
                      ...performance,
                      scrapedMovieId: insertedOrUpdatedMovie.id,
                    })),
                  )
                  .onConflictDoUpdate({
                    target: moviePerformancesTable.scrapedPerformanceId,
                    set: {
                      theatre: sql.raw(`excluded.${moviePerformancesTable.theatre.name}`),
                      seatingDeepLink: sql.raw(`excluded.${moviePerformancesTable.seatingDeepLink.name}`),
                      showtime: sql.raw(`excluded.${moviePerformancesTable.showtime.name}`),
                    },
                  })
                  .returning({
                    id: moviePerformancesTable.id,
                    scrapedPerformanceId: moviePerformancesTable.scrapedPerformanceId,
                  });

                // Delete all performances which are not up-to-date
                // These are not deleted prior to prevent any links or references in messages containing the id
                // of a performance from breaking while the performance still is valid
                // We exclude any performances which have been in the past to persist historical data
                await tx.delete(moviePerformancesTable).where(
                  and(
                    not(
                      inArray(
                        moviePerformancesTable.id,
                        insertedOrUpdatedPerformances.map(({ id }) => id),
                      ),
                    ),
                    gt(moviePerformancesTable.showtime, sql`NOW()`),
                  ),
                );

                const performanceAttributeRelationsToInsert = moviePerformancesAttributeRelations.reduce(
                  (collected, relation) => {
                    const insertedOrUpdatedPerformance = insertedOrUpdatedPerformances.find(
                      ({ scrapedPerformanceId }) => scrapedPerformanceId === relation.scrapedPerformanceId,
                    );
                    if (!insertedOrUpdatedPerformance) {
                      // `moviePerformancesAttributeRelations` contains the data for all movies, so for most performances
                      // we will not find a match here
                      return collected;
                    }

                    collected.push({
                      performanceId: insertedOrUpdatedPerformance.id,
                      attributeId: relation.attributeId,
                    });
                    return collected;
                  },
                  [] as InferInsertModel<typeof moviePerformancesToAttributesTable>[],
                );

                if (performanceAttributeRelationsToInsert.length > 0) {
                  logger.debug(
                    `Found ${performanceAttributeRelationsToInsert.length} attribute relations for one or more performances`,
                  );
                  await tx
                    .insert(moviePerformancesToAttributesTable)
                    .values(performanceAttributeRelationsToInsert)
                    .onConflictDoNothing();
                }
              }

              return insertedOrUpdatedMovie.id;
            });

            storedMovieIds.push(scrapedMovieId);
            logger.info(`Movie ${movieRefId} and relations stored`);
          } catch (error) {
            logger.error(error, `Failed to collect and insert movie ${movieRefId} and relations`);

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

  return storedMovieIds;
}

function scheduleFollowUpJobs(scrapedMovieIds: string[]): void {
  logger.info(`Enqueuing ${scrapedMovieIds.length} follow-up jobs for TMDB metadata`);
  const jobs: Parameters<typeof tmdbMetadataQueue.addBulk>[0] = scrapedMovieIds.map((id) => ({
    name: `get-tmdb-metadata-${id}`,
    data: {
      id,
    },
  }));

  tmdbMetadataQueue.addBulk(jobs);
  logger.info(`${scrapedMovieIds.length} job enqueued successfully`);
}
