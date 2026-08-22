import { snakeCase, text } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { movieLanguageEnum, notificationToneEnum, timezoneEnum } from './enums';

export const usersTable = snakeCase.table('users', {
  ...uuidPk,
  discordId: text().unique().notNull(),
  preferredTimezone: timezoneEnum(),
  preferredLanguage: movieLanguageEnum(),
  tone: notificationToneEnum(),
  ...createdAtTimestamp,
  ...updatedAtTimestamp,
});
