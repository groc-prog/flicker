import { SpanStatusCode, trace } from '@opentelemetry/api';
import dayjs from 'dayjs';
import { and, desc, eq, isNotNull, isNull, sql, type InferSelectModel } from 'drizzle-orm';

import { notificationsTable } from '@flicker/database/schemas/notifications';
import { TelemetryIdentifier } from '@flicker/telemetry/identifiers';
import { getLogger, withLogContext } from '@flicker/telemetry/logging';

import 'dayjs/plugin/utc';

import { z } from 'zod';

import db from '@flicker/database';
import { MovieLanguage, NotificationRecurrencePattern, NotificationTone } from '@flicker/database/schemas/enums';
import { usersTable } from '@flicker/database/schemas/users';

import { ServiceModuleError, ServiceModuleErrorCode } from '../error';

export type GetNotificationByIdResult = Pick<
  InferSelectModel<typeof notificationsTable>,
  | 'id'
  | 'name'
  | 'key'
  | 'preferredLanguage'
  | 'tone'
  | 'isRecurring'
  | 'recurrencePattern'
  | 'recurrenceInterval'
  | 'nextTriggerAt'
>;

export type SearchNotificationResults = Pick<InferSelectModel<typeof notificationsTable>, 'id' | 'name'>[];

const tracer = trace.getTracer('service_module.notifications');
const logger = getLogger({ [TelemetryIdentifier.ServiceModuleName]: 'notifications' });

export enum DeletedNotificationFilter {
  OnlyDeleted = 'only-deleted',
  Include = 'include',
  Exclude = 'exclude',
}

const BaseNotificationShape = z.object({
  name: z.string().trim().min(1).max(250),
  key: z.string().trim().min(1).max(250),
  preferredLanguage: z.enum(MovieLanguage).nullable().optional(),
  tone: z.enum(NotificationTone).optional(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.enum(NotificationRecurrencePattern).nullable().optional(),
  recurrenceInterval: z.number().int().positive().nullable().optional(),
});

export const AddNotificationValidator = BaseNotificationShape;

export const UpdateNotificationValidator = BaseNotificationShape.partial();

const SearchNotificationsValidator = z
  .object({
    searchKey: z.string().optional(),
    limit: z.int().min(1).default(10),
    skip: z.int().min(0).default(0),
    deletedNotifications: z.enum(DeletedNotificationFilter).default(DeletedNotificationFilter.Exclude),
  })
  .partial();

/**
 * Creates a new notification for a user.
 * @param userId - The internal ID of the user for who to create the notification.
 * @param payload - The payload for the notification to be created.
 * @throws {ServiceModuleError} If validation fails or no notification ID is returned by the query.
 * @returns The ID of the created notification.
 */
export async function addNotification(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  payload: z.infer<typeof AddNotificationValidator>,
): Promise<InferSelectModel<typeof notificationsTable>['id']> {
  return await tracer.startActiveSpan('addNotification', async (span) => {
    return await withLogContext({ [TelemetryIdentifier.UserId]: userId }, async () => {
      try {
        logger.debug(`Validating new notification for user ${userId}`);
        const { success, data, error } = AddNotificationValidator.safeParse(payload);

        if (!success) {
          logger.error(error, 'Notification validation failed');
          throw new ServiceModuleError(
            'Payload validation failed',
            ServiceModuleErrorCode.NotificationValidationFailed,
            {
              issues: error.issues,
            },
          );
        }

        logger.info(`Getting global defaults for user ${userId}`);
        const [user] = await db
          .select({
            preferredLanguage: usersTable.preferredLanguage,
            tone: usersTable.tone,
          })
          .from(usersTable)
          .where(eq(usersTable.id, userId));

        if (!user) {
          logger.error(`No user with ID ${userId} found`);
          throw new ServiceModuleError('User not found', ServiceModuleErrorCode.UserNotFound);
        }

        logger.info(`Creating new notification for user ${userId}`);
        const [notification] = await db
          .insert(notificationsTable)
          .values({
            userId,
            preferredLanguage: user.preferredLanguage ?? undefined,
            tone: user.tone ?? undefined,
            ...data,
          })
          .returning({ id: notificationsTable.id });

        if (!notification) {
          logger.error('Query did not return created notification ID');
          throw new ServiceModuleError('No notification was created', ServiceModuleErrorCode.NoQueryReturnValue);
        }

        logger.info(`Notification ${notification.id} for user ${userId} created successfully`);
        return notification.id;
      } catch (error) {
        if (!(error instanceof ServiceModuleError))
          logger.error(error, `Failed to create new notification for user ${userId}`);

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });

        throw error;
      } finally {
        span.end();
      }
    });
  });
}

/**
 * Marks a notification for a user as deleted by setting the `deletedAt` column.
 * @param userId - The ID of the user who owns the notification.
 * @param notificationId - The ID of the notification to update.
 * @param payload - The updated properties.
 * @throws {ServiceModuleError} If the notification is not found or not owned by the user.
 */
export async function updateNotification(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  notificationId: InferSelectModel<typeof notificationsTable>['id'],
  payload: z.infer<typeof UpdateNotificationValidator>,
): Promise<void> {
  await tracer.startActiveSpan('markNotificationDeleted', async (span) => {
    await withLogContext(
      { [TelemetryIdentifier.UserId]: userId, [TelemetryIdentifier.NotificationId]: notificationId },
      async () => {
        try {
          logger.debug(`Validating updated notification options for notification ${notificationId}`);
          const { success, data, error } = UpdateNotificationValidator.safeParse(payload);

          if (!success) {
            logger.error(error, 'Notification validation failed');
            throw new ServiceModuleError(
              'Payload validation failed',
              ServiceModuleErrorCode.NotificationValidationFailed,
              {
                issues: error.issues,
              },
            );
          }

          logger.info(`Updating notification ${notificationId}`);
          const [notification] = await db
            .update(notificationsTable)
            .set({
              name: data.name,
              key: data.key,
              preferredLanguage: data.preferredLanguage,
              tone: data.tone,
              isRecurring: data.isRecurring,
              recurrencePattern: data.recurrencePattern,
              recurrenceInterval: data.recurrenceInterval,
            })
            .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)))
            .returning({ id: notificationsTable.id });

          if (!notification) {
            logger.error(`No notification matching ${notificationId} found for user ${userId}`);
            throw new ServiceModuleError('Notification not found', ServiceModuleErrorCode.NotificationNotFound);
          }

          logger.info(`Notification ${notification.id} updated successfully`);
        } catch (error) {
          if (!(error instanceof ServiceModuleError))
            logger.error(error, `Failed to update notification ${notificationId} for user ${userId}`);

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
  });
}

/**
 * Marks a notification for a user as deleted by setting the `deletedAt` column.
 * @param userId - The ID of the user who owns the notification.
 * @param notificationId - The ID of the notification to mark as deleted.
 * @throws {ServiceModuleError} If the notification is not found or not owned by the user.
 */
export async function markNotificationDeleted(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  notificationId: InferSelectModel<typeof notificationsTable>['id'],
): Promise<void> {
  await tracer.startActiveSpan('markNotificationDeleted', async (span) => {
    await withLogContext(
      { [TelemetryIdentifier.UserId]: userId, [TelemetryIdentifier.NotificationId]: notificationId },
      async () => {
        try {
          logger.info(`Marking notification ${notificationId} as deleted`);
          const [notification] = await db
            .update(notificationsTable)
            .set({ deletedAt: dayjs.utc().toDate() })
            .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)))
            .returning({ id: notificationsTable.id });

          if (!notification) {
            logger.error(`No notification matching ${notificationId} found for user ${userId}`);
            throw new ServiceModuleError('Notification not found', ServiceModuleErrorCode.NotificationNotFound);
          }

          logger.info(`Notification ${notification.id} marked as deleted successfully`);
        } catch (error) {
          if (!(error instanceof ServiceModuleError))
            logger.error(error, `Failed to mark notification ${notificationId} for user ${userId} as deleted`);

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
  });
}

/**
 * Restores a notification which was previously marked as deleted for a user.
 * @param userId - The ID of the user who owns the notification.
 * @param notificationId - The ID of the notification to restore.
 * @throws {ServiceModuleError} If the notification is not found or not owned by the user.
 */
export async function restoreDeletedNotification(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  notificationId: InferSelectModel<typeof notificationsTable>['id'],
): Promise<void> {
  await tracer.startActiveSpan('restoreDeletedNotification', async (span) => {
    await withLogContext(
      { [TelemetryIdentifier.UserId]: userId, [TelemetryIdentifier.NotificationId]: notificationId },
      async () => {
        try {
          logger.info(`Restoring deleted notification ${notificationId}`);
          const [notification] = await db
            .update(notificationsTable)
            .set({ deletedAt: null })
            .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)))
            .returning({ id: notificationsTable.id });

          if (!notification) {
            logger.error(`No notification matching ${notificationId} found for user ${userId}`);
            throw new ServiceModuleError('Notification not found', ServiceModuleErrorCode.NotificationNotFound);
          }

          logger.info(`Notification ${notification.id} restored successfully`);
        } catch (error) {
          if (!(error instanceof ServiceModuleError))
            logger.error(error, `Failed to restore deleted notification ${notificationId} for user ${userId}`);

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
  });
}

/**
 * Gets a notification and it's data by it's ID.
 * @param userId - The ID of the user who owns the notification.
 * @param notificationId - The ID of the notification to restore.
 * @returns The matched notification or `null` if no matching notification is found.
 */
export async function getNotificationById(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  notificationId: InferSelectModel<typeof notificationsTable>['id'],
): Promise<GetNotificationByIdResult | null> {
  return await tracer.startActiveSpan('getNotificationById', async (span) => {
    return await withLogContext(
      { [TelemetryIdentifier.UserId]: userId, [TelemetryIdentifier.NotificationId]: notificationId },
      async () => {
        try {
          logger.info(`Getting notification ${notificationId}`);
          const [notification] = await db
            .select({
              id: notificationsTable.id,
              name: notificationsTable.name,
              key: notificationsTable.key,
              preferredLanguage: notificationsTable.preferredLanguage,
              tone: notificationsTable.tone,
              isRecurring: notificationsTable.isRecurring,
              recurrencePattern: notificationsTable.recurrencePattern,
              recurrenceInterval: notificationsTable.recurrenceInterval,
              nextTriggerAt: notificationsTable.nextTriggerAt,
            })
            .from(notificationsTable)
            .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)));

          if (!notification) {
            logger.info(`No notification matching ${notificationId} found for user ${userId}`);
            return null;
          }

          return notification;
        } catch (error) {
          logger.error(error, `Failed to get notification ${notificationId} for user ${userId}`);

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
  });
}

/**
 * Gets multiple notifications and their data by a search keyword applied to the notification
 * name.
 *
 * Records are ordered depending on the {@link DeletedNotificationFilter} option. Non-deleted
 * notifications are ordered by creation date (desc), while deleted notifications are ordered
 * by deletion date (desc). If both are included, the results will be contains the non-deleted
 * notifications first, then the deleted notifications. Previously mentioned ordering will still
 * apply.
 * @param userId - The ID of the user who owns the notifications.
 * @param options - Options for the search, including search key and pagination.
 * @throws {ServiceModuleError} If the notification is not found or not owned by the user.
 * @returns A list of matching notifications and their names and ID's.
 */
export async function searchNotifications(
  userId: InferSelectModel<typeof notificationsTable>['userId'],
  options?: z.infer<typeof SearchNotificationsValidator>,
): Promise<SearchNotificationResults> {
  return await tracer.startActiveSpan('searchNotifications', async (span) => {
    return await withLogContext({ [TelemetryIdentifier.UserId]: userId }, async () => {
      try {
        logger.debug(`Validating search parameters`);
        const { success, data, error } = SearchNotificationsValidator.safeParse(options ?? {});

        if (!success) {
          logger.error(error, 'Search parameter validation failed');
          throw new ServiceModuleError('Payload validation failed', ServiceModuleErrorCode.SearchParamsInvalid, {
            issues: error.issues,
          });
        }

        logger.info(`Getting fuzzy-searched notifications for user ${userId}`);
        const filters = [eq(notificationsTable.userId, userId)];
        if (data.searchKey) {
          logger.debug(`Filtering notifications matching search key ${data.searchKey}`);
          filters.push(sql`similarity(${notificationsTable.name}, ${data.searchKey}) > 0.5`);
        }

        switch (data.deletedNotifications) {
          case DeletedNotificationFilter.Exclude:
            filters.push(isNull(notificationsTable.deletedAt));
            break;
          case DeletedNotificationFilter.Include:
            // No need to apply any filter if deleted notification should be included
            break;
          case DeletedNotificationFilter.OnlyDeleted:
            filters.push(isNotNull(notificationsTable.deletedAt));
            break;
          default:
            throw new ServiceModuleError(
              `Unknown deletion filter ${data.deletedNotifications}`,
              ServiceModuleErrorCode.SearchParamsInvalid,
            );
        }

        const query = db
          .select({
            id: notificationsTable.id,
            name: notificationsTable.name,
          })
          .from(notificationsTable)
          .where(and(...filters));

        if (data.searchKey) {
          query.orderBy(
            desc(sql`similarity(${notificationsTable.name}, ${data.searchKey})`),
            desc(notificationsTable.createdAt),
          );
        } else {
          switch (data.deletedNotifications) {
            case DeletedNotificationFilter.Exclude:
              query.orderBy(desc(notificationsTable.createdAt));
              break;
            case DeletedNotificationFilter.Include:
              query.orderBy(
                sql`case when ${notificationsTable.deletedAt} is null then 0 else 1 end`,
                sql`case
                  when ${notificationsTable.deletedAt} is null then ${notificationsTable.createdAt}
                  else ${notificationsTable.deletedAt}
                end desc`,
              );
              break;
            case DeletedNotificationFilter.OnlyDeleted:
              query.orderBy(desc(notificationsTable.deletedAt), desc(notificationsTable.createdAt));
              break;
            default:
              throw new ServiceModuleError(
                `Unknown deletion filter ${data.deletedNotifications}`,
                ServiceModuleErrorCode.SearchParamsInvalid,
              );
          }
        }

        if (data.limit) {
          logger.debug(`Limiting query to ${data.limit} results`);
          query.limit(data.limit);
        }

        if (data.skip) {
          logger.debug(`Skipping first ${data.skip} results`);
          query.offset(data.skip);
        }

        const notifications = await query;

        logger.info(`Returning ${notifications.length} matched notifications for user ${userId}`);
        return notifications;
      } catch (error) {
        if (!(error instanceof ServiceModuleError))
          logger.error(error, `Failed to search notification for user ${userId}`);

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });

        throw error;
      } finally {
        span.end();
      }
    });
  });
}
