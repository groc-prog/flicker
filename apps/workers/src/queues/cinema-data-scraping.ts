import db from '@flicker/database';
import { AttributeCategory, attributeCategoryEnum, attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { SpanStatusCode, trace } from '@opentelemetry/api';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { and, eq, gt, sql, type InferInsertModel } from 'drizzle-orm';
import { get, isArray, isPlainObject } from 'lodash';

import { attachWorkerEventLogging, logger } from '../telemetry/logging';
import { movieProcessingQueueGroup } from './groups';

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

const identifier = 'cinema-data-scraping';
const tracer = trace.getTracer(`worker.${identifier}`);

export const queue = movieProcessingQueueGroup.getQueue<void>(identifier, {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});

export const worker = movieProcessingQueueGroup.getWorker<void>(
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
          await storeMovies(data, attributeIdMap, movieRelations, performanceRelations);
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
        const error = new Error(
          `Request to ${cinemaUrl} failed with status (${response.status}) ${response.statusText}`,
        );
        logger.error({ err: error });
        throw error;
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

            const payloadLength = jsonDataEnd + 1 - jsonDataStart;
            span.setAttribute('data.extracted_length', payloadLength);

            const jsonSerializedData = unparsedData.slice(jsonDataStart, jsonDataEnd + 1);
            logger.debug(`Content string parsed from indexes ${jsonDataStart} to ${jsonDataStart}`);
            const parsedData = JSON.parse(jsonSerializedData);
            logger.info('Stringified JSON data extracted successfully, attempting to parse data into JSON object');

            if (!isPlainObject(parsedData))
              throw new Error(
                'Extracted JSON data is not an object. This might indicate that the embedded data has changed',
              );

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
        const { moviePk } = performanceData;
        if (!moviePk) {
          logger.warn(`Performance ${performanceRefId} does not define a moviePk property, skipping`);
          continue;
        }

        // The scraped data can be funky at times, so we need to double check everything
        if (!movieRelations.has(moviePk)) {
          logger.warn(`Performance ${performanceRefId} defines unknown movie ref ID ${moviePk}, skipping`);
          continue;
        }

        logger.debug(`Found matching movie ref ID for movie ${moviePk} and performance ${performanceRefId}`);
        const relations = movieRelations.get(moviePk)!;
        relations.performances.add(performanceRefId);
      }

      logger.debug('Adding attributes to map');
      for (const [attributeCategory, attributeCategoryValues] of Object.entries(attributes)) {
        if (!attributeCategoryEnum.enumValues.includes(attributeCategory)) {
          logger.debug(`Unknown attribute category ${attributeCategory}, skipping`);
          continue;
        }
        if (!isPlainObject(attributeCategoryValues)) {
          logger.warn(`Values for attribute category ${attributeCategory} is not a object, skipping`);
          continue;
        }

        for (const [attributeKey, attributeData] of Object.entries(attributeCategoryValues)) {
          if (!attributeData.name || typeof attributeData.name !== 'string') {
            logger.warn(
              `Attribute name for attribute ${attributeKey} in category ${attributeCategory} is not a string, skipping`,
            );
            continue;
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
                continue;
              }

              const movieRelation = movieRelations.get(movieRefId)!;
              movieRelation.attributes.add(`${attributeCategory}.${attributeKey}`);
            }
          } else {
            logger.debug(`Attributes has no movies associated with it or movies key is not a array, skipping`);
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
              `Attributes has no performances associated with it or performances key is not a array, skipping`,
            );
          }
        }
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
): Promise<void> {
  logger.info(`Storing ${movieRelations.size} movies and their relations`);
  for (const [movieRefId, movieRelation] of movieRelations.entries()) {
    await tracer.startActiveSpan(
      `storeMovie`,
      { attributes: { [TelemetryIdentifier.MovieRefId]: movieRefId } },
      async (span) => {
        await withLogContext({ [TelemetryIdentifier.MovieRefId]: movieRefId }, async (scopedLogger) => {
          scopedLogger.info(`Storing movie ${movieRefId} and it's relations`);

          try {
            const movieMetadata = get(data, `movies.items.${movieRefId}`);
            if (!movieMetadata) {
              scopedLogger.warn(`Movie ${movieRefId} not found in scraped data, skipping`);
              return;
            }

            if (!movieMetadata.title || typeof movieMetadata.title !== 'string') {
              scopedLogger.warn(`Movie ${movieRefId} does not have a valid title, skipping`);
              return;
            }
            if (!movieMetadata.startingDate || typeof movieMetadata.startingDate !== 'string') {
              scopedLogger.warn(`Movie ${movieRefId} does not have a valid starting date, skipping`);
              return;
            }
            if (!movieMetadata.origTitle || typeof movieMetadata.origTitle !== 'string') {
              scopedLogger.warn(
                `Movie ${movieRefId} does not have a valid original title. Original title will not be stored`,
              );
            }
            if (!movieMetadata.description || typeof movieMetadata.description !== 'string') {
              scopedLogger.warn(
                `Movie ${movieRefId} does not have a valid description. Description will not be stored`,
              );
            }
            if (!movieMetadata.length || typeof movieMetadata.length !== 'number') {
              scopedLogger.warn(`Movie ${movieRefId} does not have a valid runtime. Runtime will not be stored`);
            }
            if (!movieMetadata.images?.poster?.url || typeof movieMetadata.images?.poster?.url !== 'string') {
              scopedLogger.warn(
                `Movie ${movieRefId} does not have a valid poster path. Poster path will not be stored`,
              );
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
              originalTitle: movieMetadata.origTitle,
              description: movieMetadata.description,
              runtime: movieMetadata.length,
              posterPath: movieMetadata.images?.poster?.url,
              availableAt: dayjs(movieMetadata.startingDate).add(1, 'day').toDate(),
            };

            if (movieRelation.attributes.size !== 0) {
              scopedLogger.debug(`Preparing ${movieRelation.attributes.size} attribute relations for movies`);
              for (const attributePath of movieRelation.attributes.keys()) {
                const attributeId = attributeIdMap.get(attributePath);
                if (!attributeId) {
                  scopedLogger.warn(`No attribute ID for path ${attributePath} found, skipping relation`);
                  continue;
                }

                movieAttributeRelations.push({
                  attributeId,
                });
              }
            }

            if (movieRelation.performances.size !== 0) {
              scopedLogger.debug(`Preparing ${movieRelation.performances.size} performance relations`);
              for (const performanceRefId of movieRelation.performances.keys()) {
                const performanceMetadata = get(data, `performances.items.${performanceRefId}`);
                if (!performanceMetadata) {
                  scopedLogger.warn(`Performance ${performanceRefId} not found in scraped data, skipping`);
                  continue;
                }

                if (!performanceMetadata.theatreName || typeof performanceMetadata.theatreName !== 'string') {
                  scopedLogger.warn(`Performance ${performanceRefId} does not have a valid theatre name, skipping`);
                  continue;
                }
                if (!performanceMetadata.deeplinkURL || typeof performanceMetadata.deeplinkURL !== 'string') {
                  scopedLogger.warn(`Performance ${performanceRefId} does not have a valid deeplink URL, skipping`);
                  continue;
                }
                if (!performanceMetadata.timeUtc || typeof performanceMetadata.timeUtc !== 'number') {
                  scopedLogger.warn(`Performance ${performanceRefId} does not have a valid showtime, skipping`);
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
              scopedLogger.debug(`Preparing ${performanceRelations.size} attribute relations for performances`);
              for (const [performanceRefId, performanceRelation] of performanceRelations.entries()) {
                if (performanceRelation.attributes.size === 0) {
                  scopedLogger.debug(`Performance ${performanceRefId} does not have any attribute relations, skipping`);
                  continue;
                }

                for (const attributePath of performanceRelation.attributes.keys()) {
                  const attributeId = attributeIdMap.get(attributePath);
                  if (!attributeId) {
                    scopedLogger.warn(`No attribute ID for path ${attributePath} found, skipping relation`);
                    continue;
                  }

                  moviePerformancesAttributeRelations.push({
                    attributeId,
                    scrapedPerformanceId: performanceRefId,
                  });
                }
              }
            }

            scopedLogger.debug(`Opening transaction to store movie ${movieRefId} and relations`);
            await db.transaction(async (tx) => {
              const insertedOrUpdatedMovie = await tx
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

              const insertedOrUpdatedMovieId = insertedOrUpdatedMovie[0]?.id;
              if (!insertedOrUpdatedMovieId) throw new Error('Query did not return inserted or updated movie');

              // Remove any previously inserted attribute relations so only the newest ones are stored
              await tx
                .delete(scrapedMoviesToAttributesTable)
                .where(eq(scrapedMoviesToAttributesTable.scrapedMovieId, insertedOrUpdatedMovieId));
              if (movieAttributeRelations.length > 0) {
                scopedLogger.debug(
                  `Found ${movieAttributeRelations.length} attribute relations for movie ${movieRefId}`,
                );
                await tx
                  .insert(scrapedMoviesToAttributesTable)
                  .values(
                    movieAttributeRelations.map((relation) => ({
                      ...relation,
                      scrapedMovieId: insertedOrUpdatedMovieId,
                    })),
                  )
                  .onConflictDoNothing();
              }

              // Delete all performances prior to inserting the new ones so that we do not
              // accidentally persist any outdated ones
              // We exclude any performances which have been in the past to persist historical data
              await tx
                .delete(moviePerformancesTable)
                .where(
                  and(
                    eq(moviePerformancesTable.scrapedMovieId, insertedOrUpdatedMovieId),
                    gt(moviePerformancesTable.showtime, sql`NOW()`),
                  ),
                );

              if (moviePerformances.length > 0) {
                scopedLogger.debug(`Found ${moviePerformances.length} performances relations for movie ${movieRefId}`);
                const insertedOrUpdatedPerformances = await tx
                  .insert(moviePerformancesTable)
                  .values(
                    moviePerformances.map((performance) => ({
                      ...performance,
                      scrapedMovieId: insertedOrUpdatedMovieId,
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
                  scopedLogger.debug(
                    `Found ${performanceAttributeRelationsToInsert.length} attribute relations for one or more performances`,
                  );
                  await tx
                    .insert(moviePerformancesToAttributesTable)
                    .values(performanceAttributeRelationsToInsert)
                    .onConflictDoNothing();
                }
              }
            });

            scopedLogger.info(`Movie ${movieRefId} and relations stored`);
          } catch (error) {
            scopedLogger.error(error, `Failed to collect and insert movie ${movieRefId} and relations`);

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
}
