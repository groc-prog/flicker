import { pgEnum } from 'drizzle-orm/pg-core';

export enum NotificationRecurrencePattern {
  Unchanged = 'unchanged',
  Hourly = 'hours',
  Daily = 'days',
  Weekly = 'weeks',
}

export enum BotTone {
  Normal = 'normal',
  Lewd = 'lewd',
  SuperHyped = 'super_hyped',
}

export enum AttributeCategory {
  Fsk = 'fsk',
  SeatClass = 'seatClasses',
  Technical = 'technical',
  Genres = 'genres',
}

export enum MovieLanguage {
  German = 'de',
  English = 'en',
}

export const notificationRecurrencePatternEnum = pgEnum(
  'notification_recurrence_pattern',
  Object.values(NotificationRecurrencePattern).filter((value) => value !== NotificationRecurrencePattern.Unchanged) as [
    string,
    ...string[],
  ],
);

export const botToneEnum = pgEnum('bot_tone', BotTone);

export const attributeCategoryEnum = pgEnum('attribute_category', AttributeCategory);

export const movieLanguageEnum = pgEnum('movie_language', MovieLanguage);
