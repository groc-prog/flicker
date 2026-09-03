import { jsonb, snakeCase, text } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { BotTone, botToneEnum, MovieLanguage } from './enums';

export const groupsTable = snakeCase.table('groups', {
  ...uuidPk,
  /** The associated Discord ID. */
  discordId: text().unique().notNull(),
  /** The channel in which notifications will be posted. */
  discordChannelId: text(),
  /**
   * The languages in which messages will be send.
   * If multiple are defined, each message will be send **once per language**.
   */
  languages: jsonb().$type<MovieLanguage[]>().default([MovieLanguage.English]),
  /** The tone the messages will be in. */
  tone: botToneEnum().notNull().default(BotTone.Normal),
  ...createdAtTimestamp,
  ...updatedAtTimestamp,
});
