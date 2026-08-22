import { pgEnum } from 'drizzle-orm/pg-core';

export enum NotificationRecurrencePattern {
  Hourly = 'hourly',
  Daily = 'daily',
  Weekly = 'weekly',
}

export enum NotificationTone {
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
  NotificationRecurrencePattern,
);

export const notificationToneEnum = pgEnum('notification_tone', NotificationTone);

export const attributeCategoryEnum = pgEnum('attribute_category', AttributeCategory);

export const movieLanguageEnum = pgEnum('movie_language', MovieLanguage);

export const timezoneEnum = pgEnum('timezone', Intl.supportedValuesOf('timeZone') as [string, ...string[]]);
