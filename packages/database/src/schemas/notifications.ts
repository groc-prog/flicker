import { isNotNull, sql } from 'drizzle-orm';
import { boolean, index, integer, snakeCase, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { movieLanguageEnum, notificationRecurrencePatternEnum, NotificationTone, notificationToneEnum } from './enums';
import { usersTable } from './users';

export const notificationsTable = snakeCase.table(
  'notifications',
  {
    ...uuidPk,
    /** A user-defined name for this notification. */
    name: varchar({ length: 250 }).notNull(),
    /** The search key used to do a movie lookup. */
    key: varchar({ length: 250 }).notNull(),
    /**
     * The preferred language in which the notification will be send. If not defined, the
     * default language of the related client will be used.
     */
    preferredLanguage: movieLanguageEnum(),
    /** The tone/vibe the notification text will have. */
    tone: notificationToneEnum().notNull().default(NotificationTone.Normal),
    /** Whether the notification will be triggered once or multiple times. */
    isRecurring: boolean().notNull().default(false),
    /**
     * The recurrence pattern to use.
     *
     * _Note_: This only has a effect if both **isRecurring** and **recurrenceInterval**
     * are defined.
     */
    recurrencePattern: notificationRecurrencePatternEnum(),
    /**
     * The time to wait between intervals, depending on the selected **recurrencePattern**.
     *
     * _Note_: This only has a effect if both **isRecurring** and **recurrencePattern**
     * are defined.
     */
    recurrenceInterval: integer(),
    /** The user who owns the notification. */
    userId: uuid()
      .notNull()
      .references(() => usersTable.id),
    /** The date after which the notification can be triggered again. */
    nextTriggerAt: timestamp({
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    deletedAt: timestamp({
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    ...createdAtTimestamp,
    ...updatedAtTimestamp,
  },
  (table) => [
    unique().on(table.id, table.name),
    index().on(table.nextTriggerAt).where(isNotNull(table.nextTriggerAt)),
    index('idx_notification_name').using('gin', sql`${table.name} gin_trgm_ops`),
  ],
);
