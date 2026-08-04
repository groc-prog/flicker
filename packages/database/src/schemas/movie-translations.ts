import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, snakeCase, text, unique, uuid } from 'drizzle-orm/pg-core';

import { createdAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { moviesTable } from './movies';

export interface MovieTranslationVideo {
  /** The ID provided by TMDB. */
  id: string;
  /**
   * Name of the video.
   * @example 'Behind the scenes on the Trojan Horse for the World Premiere of The Odyssey in London.'
   */
  name: string;
  /**
   * The key on the specific site the video is hosted.
   * @example `dQw4w9WgXcQ` in the Youtube URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   */
  key: string;
  /**
   * The name of the site the video is hosted on.
   * @example 'Youtube'
   */
  site: string;
  /**
   * The best quality offered by the hosting site.
   * @example 1080
   */
  quality: number;
  /**
   * The type of the video.
   * @example 'Featurette'
   */
  type: string;
  /**
   * Whether or not this is a official video related to the movie.
   */
  official: boolean;
}

export enum TranslationLocale {
  German = 'de',
  English = 'en',
}

export const translationLocaleEnum = pgEnum('translation_locale', TranslationLocale);

export const movieTranslationsTable = snakeCase.table(
  'movie_translations',
  {
    ...uuidPk,
    language: translationLocaleEnum().notNull(),
    /** Original title of the movie. */
    title: text().notNull(),
    /** Duration of the movie in minutes. */
    description: text(),
    /** Videos related the movie. */
    videos: jsonb().$type<MovieTranslationVideo[]>(),
    /** The link to the movies homepage. */
    homepage: text(),
    movieId: uuid().references(() => moviesTable.id, { onDelete: 'set null' }),
    ...createdAtTimestamp,
  },
  (table) => [
    unique().on(table.language, table.movieId),
    index('idx_movie_translations_language_title').using('gin', sql`${table.language}, ${table.title} gin_trgm_ops`),
  ],
);

// index('idx_products_name_trgm').using(
//       'gin',
//       sql`${table.name} gin_trgm_ops` // <--- Crucial: specifies the trigram operator class
//     ),
