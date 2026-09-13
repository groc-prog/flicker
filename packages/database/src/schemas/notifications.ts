import { isNotNull, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  snakeCase,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { notificationRecurrencePatternEnum } from './enums';
import { groupsTable } from './groups';

export const notificationsTable = snakeCase.table(
  'notifications',
  {
    ...uuidPk,
    /** A user-defined name for this notification. */
    name: varchar({ length: 250 }).notNull(),
    /**
     * The search key a movie title must match (fuzzy search) to be considered for this
     * notification.
     *
     * _Note_: This value will be matched against the localized titles of the movie. This
     * prevents matches for english titles if the group does not have english enabled as a
     * language.
     */
    searchKey: varchar({ length: 250 }),
    /** The genre a movie must have to be considered for this notification. */
    genre: varchar(),
    /** The minimal vote score a movie must have to be considered for this notification. */
    minVoteAverage: decimal({ precision: 3, scale: 1, mode: 'number' }).$type<number>(),
    /**
     * Whether the movie must have at least one performance (in the future) available to
     * be considered for this notification.
     */
    ensurePerformancesAvailable: boolean(),
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
    /** The group who should receive the notification. */
    groupId: uuid().references(() => groupsTable.id),
    /** The date after which the notification can be triggered again. */
    nextTriggerAt: timestamp({
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    /** The date at which the notification was last triggered.  */
    lastTriggerAt: timestamp({
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
    index('idx_notification_key_trgm').using('gin', sql`${table.searchKey} gin_trgm_ops`),
    index().on(table.genre).where(isNotNull(table.genre)),
    index().on(table.minVoteAverage).where(isNotNull(table.minVoteAverage)),
    check(
      'check_filters_set',
      sql`${table.searchKey} IS NOT NULL OR ${table.genre} IS NOT NULL OR ${table.minVoteAverage} IS NOT NULL`,
    ),
  ],
);
