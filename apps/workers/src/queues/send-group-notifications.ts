import { SpanStatusCode } from '@opentelemetry/api';
import dayjs from 'dayjs';
import { ButtonStyle, ContainerBuilder, MessageFlags, Routes, SeparatorSpacingSize } from 'discord.js';
import { count, desc, eq, gt, inArray, min, sql, type InferSelectModel } from 'drizzle-orm';

import db from '@flicker/database';
import { groupsTable } from '@flicker/database/schemas/groups';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { moviesTable } from '@flicker/database/schemas/movies';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { renderTemplate } from '@flicker/i18n/utils';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { withLogContext } from '@flicker/telemetry/logging';

import { restApi } from '../discord';
import { attachWorkerEventLogging, logger } from '../telemetry/logging';
import { movieProcessingTracer } from '../telemetry/tracing';
import { notificationsQueueGroup } from './queue-groups';

export interface SendGroupNotificationsJob {
  groupId: InferSelectModel<typeof groupsTable>['id'];
  movieId: InferSelectModel<typeof moviesTable>['id'];
  notificationIds: InferSelectModel<typeof notificationsTable>['id'][];
}

type GroupMetadata = Pick<InferSelectModel<typeof groupsTable>, 'discordId' | 'tone'> & {
  discordChannelId: NonNullable<InferSelectModel<typeof groupsTable>['discordChannelId']>;
};

type MovieMetadata = Pick<
  InferSelectModel<typeof moviesTable>,
  'id' | 'language' | 'title' | 'description' | 'posterPath' | 'videos' | 'voteAverage' | 'voteCount' | 'availableAt'
> & {
  hasPerformances: boolean;
  nextAvailablePerformance: InferSelectModel<typeof moviePerformancesTable>['showtime'] | null;
};

type NotificationMetadata = Pick<InferSelectModel<typeof notificationsTable>, 'name'>;

const identifier = 'send-group-notification';

export const queue = notificationsQueueGroup.getQueue<SendGroupNotificationsJob>(identifier, {
  embedded: true,
  dataPath: process.env.BUNQUEUE_DATA_PATH,
});

export const worker = notificationsQueueGroup.getWorker<SendGroupNotificationsJob>(
  identifier,
  async (job) => {
    await movieProcessingTracer.startActiveSpan(
      `${identifier} process`,
      {
        attributes: {
          [TelemetryIdentifier.WorkerJobId]: job.id,
          [TelemetryIdentifier.WorkerJobName]: job.name,
          [TelemetryIdentifier.GroupId]: job.data.groupId,
        },
      },
      async (span) => {
        try {
          await withLogContext({ [TelemetryIdentifier.GroupId]: job.data.groupId }, async () => {
            logger.info(`Getting configuration for group ${job.data.groupId}`);
            const [group] = await db
              .select({
                discordId: groupsTable.discordId,
                discordChannelId: sql<string>`${groupsTable.discordChannelId}`,
                tone: groupsTable.tone,
              })
              .from(groupsTable)
              .where(eq(groupsTable.id, job.data.groupId));
            if (!group) throw new Error(`No group with ID ${job.data.groupId} found`);

            logger.info(`Fetching metadata for movie ${job.data.movieId}`);
            const [movie] = await db
              .select({
                id: moviesTable.id,
                language: moviesTable.language,
                title: moviesTable.title,
                description: moviesTable.description,
                posterPath: moviesTable.posterPath,
                videos: moviesTable.videos,
                voteAverage: moviesTable.voteAverage,
                voteCount: moviesTable.voteCount,
                availableAt: moviesTable.availableAt,
                hasPerformances: sql<boolean>`${gt(count(moviePerformancesTable.id), 0)}`,
                nextAvailablePerformance: min(moviePerformancesTable.showtime),
              })
              .from(moviesTable)
              .leftJoin(moviePerformancesTable, eq(moviePerformancesTable.movieId, moviesTable.id))
              .where(eq(moviesTable.id, job.data.movieId))
              .groupBy(moviesTable.id);
            if (!movie) throw new Error(`No movie with ID ${job.data.movieId} found`);

            const notifications = await db
              .select({ name: notificationsTable.name })
              .from(notificationsTable)
              .where(inArray(notificationsTable.id, job.data.notificationIds))
              .limit(5)
              .orderBy(desc(notificationsTable.createdAt));

            await sendNotification(group, movie, notifications, job.data.notificationIds.length);

            logger.info(`Setting cooldown time for notifications`);
            await db
              .update(notificationsTable)
              .set({
                nextTriggerAt: sql`NOW() + (${notificationsTable.recurrenceInterval} || ' ' || ${notificationsTable.recurrencePattern})::INTERVAL`,
                lastTriggerAt: sql`NOW()`,
              })
              .where(
                // To ensure the last finished job also writes the timestamp, we just override any existing value
                // in all job runs
                inArray(notificationsTable.id, job.data.notificationIds),
              );
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

async function sendNotification(
  group: GroupMetadata,
  movie: MovieMetadata,
  notifications: NotificationMetadata[],
  totalNotifications: number,
): Promise<void> {
  await movieProcessingTracer.startActiveSpan(
    `sendDiscordChannelMessage`,
    {
      attributes: {
        [TelemetryIdentifier.DiscordGuildId]: group.discordId,
        [TelemetryIdentifier.DiscordChannelId]: group.discordChannelId,
      },
    },
    async (span) => {
      try {
        await withLogContext(
          {
            [TelemetryIdentifier.DiscordGuildId]: group.discordId,
            [TelemetryIdentifier.DiscordChannelId]: group.discordChannelId,
          },
          async () => {
            logger.info(
              `Sending notification for movie ID ${movie.id} in channel ${group.discordChannelId} in guild ${group.discordId}`,
            );

            const container = new ContainerBuilder().setAccentColor(0x5865f2).addSectionComponents((section) => {
              section.addTextDisplayComponents((textDisplay) =>
                textDisplay.setContent(
                  renderTemplate(`tone.${group.tone}.send-notification.announcement`, movie.language, {
                    title: movie.title,
                  }),
                ),
              );

              if (movie.posterPath) {
                // Poster paths can either be absolute URLs from scraped data or relative URLs from TMDB
                logger.debug('Poster path available, adding thumbnail');
                const fullImageUrl = movie.posterPath.startsWith('https://')
                  ? movie.posterPath
                  : `https://image.tmdb.org/t/p/original${movie.posterPath}`;

                section.setThumbnailAccessory((thumbnail) =>
                  thumbnail
                    .setDescription(
                      renderTemplate(`tone.${group.tone}.send-notification.poster-alt`, movie.language, {
                        title: movie.title,
                      }),
                    )
                    .setURL(fullImageUrl),
                );
              }

              return section;
            });

            container
              .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Large))
              .addSectionComponents((section) => {
                section.addTextDisplayComponents((textDisplay) =>
                  textDisplay.setContent(
                    renderTemplate(`tone.${group.tone}.send-notification.metadata`, movie.language, {
                      description: movie.description,
                      voteAverage: movie.voteCount === 0 ? '-' : movie.voteAverage,
                      voteCount: movie.voteCount,
                      notifications: notifications.map(({ name }) => name).join(', '),
                      totalNotifications,
                      nextAvailablePerformance:
                        movie.nextAvailablePerformance === null
                          ? '-'
                          : dayjs.utc(movie.nextAvailablePerformance).tz('Europe/Vienna').format('YYYY-MM-DD HH:mm'),
                    }),
                  ),
                );

                const trailer = movie.videos?.find(({ type }) => type === 'Trailer');
                if (trailer) {
                  logger.debug('Trailer available, adding button accessory');
                  section.setButtonAccessory((button) =>
                    button
                      .setCustomId('trailer')
                      .setLabel(renderTemplate(`tone.${group.tone}.send-notification.trailer`, movie.language))
                      .setStyle(ButtonStyle.Primary),
                  );
                }

                return section;
              });

            await restApi.post(Routes.channelMessages(group.discordChannelId), {
              body: {
                flags: MessageFlags.IsComponentsV2,
                components: [container.toJSON()],
              },
            });
            logger.info(`Notification send successfully`);
          },
        );
      } finally {
        span.end();
      }
    },
  );
}
