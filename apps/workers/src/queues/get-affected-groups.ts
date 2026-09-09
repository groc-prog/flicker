import { SpanStatusCode } from '@opentelemetry/api';
import { and, eq, isNotNull, isNull, lte, or, sql, type InferSelectModel } from 'drizzle-orm';

import db from '@flicker/database';
import { MovieLanguage } from '@flicker/database/schemas/enums';
import { groupsTable } from '@flicker/database/schemas/groups';
import { moviesTable } from '@flicker/database/schemas/movies';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { attachWorkerEventLogging, logger } from '../telemetry/logging';
import { movieProcessingTracer } from '../telemetry/tracing';
import { notificationsQueueGroup } from './queue-groups';
import { queue as sendGroupNotificationQueue } from './send-group-notifications';

export interface GetMatchingGroupNotificationsJob {
  scrapedMovieId: InferSelectModel<typeof moviesTable>['scrapedMovieId'];
}

type MovieMapItem = {
  title: InferSelectModel<typeof moviesTable>['title'];
  id: InferSelectModel<typeof moviesTable>['id'];
};

const identifier = 'get-matching-group-notifications';

const parsedSimilarityThreshold = Number(process.env.JOB_GET_AFFECTED_GROUPS_SIMILARITY_THRESHOLD);
const similarityThreshold = isNaN(parsedSimilarityThreshold) ? 0.7 : parsedSimilarityThreshold;

if (similarityThreshold <= 0 || similarityThreshold >= 1) {
  logger.error('JOB_GET_AFFECTED_GROUPS_SIMILARITY_THRESHOLD must be between 0 and 1');
  process.exit(1);
}

export const queue = notificationsQueueGroup.getQueue<GetMatchingGroupNotificationsJob>(identifier, {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});

export const worker = notificationsQueueGroup.getWorker<GetMatchingGroupNotificationsJob>(
  identifier,
  async (job) => {
    await movieProcessingTracer.startActiveSpan(
      `${identifier} process`,
      {
        attributes: {
          [TelemetryIdentifier.WorkerJobId]: job.id,
          [TelemetryIdentifier.WorkerJobName]: job.name,
          [TelemetryIdentifier.ScrapedMovieId]: job.data.scrapedMovieId,
        },
      },
      async (span) => {
        try {
          await withLogContext({ [TelemetryIdentifier.MovieId]: job.data.scrapedMovieId }, async () => {
            logger.info(`Getting movie names for scraped movie ${job.data.scrapedMovieId}`);
            const movies = await db
              .select({ language: moviesTable.language, title: moviesTable.title, id: moviesTable.id })
              .from(moviesTable)
              .where(eq(moviesTable.scrapedMovieId, job.data.scrapedMovieId));

            const movieMap = new Map<MovieLanguage, MovieMapItem>(
              movies.map(({ language, title, id }) => [language, { title, id }]),
            );
            logger.debug(`Scraped movie ${job.data.scrapedMovieId} has ${movieMap.size} translated titles`);

            logger.info(`Collecting groups with matching notifications for scraped movie ${job.data.scrapedMovieId}`);
            const groups = await db
              .select({
                groupId: sql<string>`${notificationsTable.groupId}`,
                languages: groupsTable.languages,
                notificationIds: sql<string[]>`json_agg(DISTINCT ${notificationsTable.id})`,
              })
              .from(notificationsTable)
              .innerJoin(
                groupsTable,
                and(eq(notificationsTable.groupId, groupsTable.id), isNotNull(groupsTable.discordChannelId)),
              )
              .innerJoin(
                moviesTable,
                and(
                  eq(moviesTable.scrapedMovieId, job.data.scrapedMovieId),
                  // The matched movie must be in one of the languages supported by the group
                  // This way we prevent matching english titles if the group is non-english
                  sql`${groupsTable.languages} @> jsonb_build_array(${moviesTable.language})`,
                  sql`similarity(${moviesTable.title}, ${notificationsTable.key}) >= ${similarityThreshold}`,
                ),
              )
              .where(
                and(
                  isNotNull(notificationsTable.groupId),
                  // The notification must either have not been triggered yet or it's cooldown must have expired
                  or(lte(notificationsTable.nextTriggerAt, sql`NOW()`), isNull(notificationsTable.lastTriggerAt)),
                ),
              )
              .groupBy(notificationsTable.groupId, groupsTable.languages);

            if (groups.length === 0) {
              logger.info(
                `Found no groups with pending notifications matching available titles for scraped movie ${job.data.scrapedMovieId}, skipping`,
              );
              return;
            }

            logger.info(`Found ${groups.length} groups with pending notifications, enqueueing follow-up jobs`);
            const jobs = groups.reduce(
              (collected, group) => {
                for (const language of group.languages) {
                  const movie = movieMap.get(language);
                  if (!movie) continue;

                  logger.debug(`Adding job for movie ID ${movie.id} and language ${language}`);
                  collected.push({
                    name: `send-group-notification-${group.groupId}-${language}`,
                    data: {
                      groupId: group.groupId,
                      movieId: movie.id,
                      notificationIds: group.notificationIds,
                    },
                  });
                }

                return collected;
              },
              [] as Parameters<typeof sendGroupNotificationQueue.addBulk>[0],
            );

            sendGroupNotificationQueue.addBulk(jobs);
            logger.info(`${jobs.length} jobs enqueued successfully`);
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
    concurrency: 1,
  },
);
attachWorkerEventLogging(worker);
