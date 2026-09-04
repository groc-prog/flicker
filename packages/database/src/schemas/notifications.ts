import { isNotNull, sql } from 'drizzle-orm';
import { boolean, check, index, integer, snakeCase, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { movieLanguageEnum, notificationRecurrencePatternEnum } from './enums';
import { groupsTable } from './groups';
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
     *
     * For groups this will be ignored as groups can define multiple languages.
     */
    language: movieLanguageEnum(),
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
    /** The user who created the notification. */
    creatorId: uuid()
      .notNull()
      .references(() => usersTable.id),
    /** The user who should receive the notification. */
    userId: uuid().references(() => usersTable.id),
    /** The group who should receive the notification. */
    groupId: uuid().references(() => groupsTable.id),
    /** The date after which the notification can be triggered again. */
    nextTriggerAt: timestamp({
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
    check('receiver_defined_check', sql`${table.userId} IS NOT NULL OR ${table.groupId} IS NOT NULL`),
  ],
);
