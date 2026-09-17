import { isNotNull } from 'drizzle-orm';
import { index, primaryKey, snakeCase, timestamp, uuid } from 'drizzle-orm/pg-core';

import { moviesTable } from './movies';
import { notificationsTable } from './notifications';

export const movieNotificationCooldownTable = snakeCase.table(
  'movie_notification_cooldown',
  {
    /** The ID of the movie which is affected by the cooldown.  */
    movieId: uuid()
      .notNull()
      .references(() => moviesTable.id, { onDelete: 'cascade' }),
    /** The ID of the notification which is affected by the cooldown. */
    notificationId: uuid()
      .notNull()
      .references(() => notificationsTable.id, { onDelete: 'cascade' }),
    /** The date after which the notification can be triggered again. */
    nextTriggerAt: timestamp({
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
  },
  (table) => [
    primaryKey({ columns: [table.movieId, table.notificationId] }),
    index().on(table.nextTriggerAt).where(isNotNull(table.nextTriggerAt)),
  ],
);
