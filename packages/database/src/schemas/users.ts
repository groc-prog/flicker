import { snakeCase, text } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { botToneEnum, movieLanguageEnum, timezoneEnum } from './enums';

export const usersTable = snakeCase.table('users', {
  ...uuidPk,
  /** The associated Discord ID. */
  discordId: text().unique().notNull(),
  /** The timezone in which timestamps in messages will be defined. */
  timezone: timezoneEnum(),
  /** The language in which messages will be send. */
  language: movieLanguageEnum(),
  /** The tone the messages will be in. */
  tone: botToneEnum(),
  ...createdAtTimestamp,
  ...updatedAtTimestamp,
});
