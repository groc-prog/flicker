import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { scrapedMoviesTable } from './scraped-movies';

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

export enum MovieLanguage {
  German = 'de',
  English = 'en',
}

export const movieLanguageEnum = pgEnum('movie_language', MovieLanguage);

export const moviesTable = snakeCase.table(
  'movies',
  {
    ...uuidPk,
    /**
     * ID provided by the TMDB API.
     *
     * _Note:_ **This value will be `null`** for special events which do not
     * provide the necessary values to fetch the metadata from the TMDB API.
     */
    tmdbId: integer(),
    /** */
    language: movieLanguageEnum().notNull(),
    /** Original title of the movie. */
    title: text().notNull(),
    /** Duration of the movie in minutes. */
    description: text(),
    /** The link to a poster image. */
    posterPath: text(),
    /** Videos related the movie. */
    videos: jsonb().$type<MovieTranslationVideo[]>(),
    /** The link to the movies homepage. */
    homepage: text(),
    /** Movie budget from TMDB. */
    budget: integer(),
    /** Movie revenue from TMDB. */
    revenue: integer(),
    /** Whether the movie is adult rated. */
    adult: boolean(),
    /** Original language of the movie. */
    originalLanguage: text(),
    /** TMDB popularity score. */
    popularity: decimal({
      mode: 'number',
    }),
    /** Movie runtime in minutes. */
    runtime: integer(),
    /** TMDB rating average. */
    voteAverage: decimal({ precision: 3, scale: 1 }).$type<number>(),
    /** TMDB vote count. */
    voteCount: integer(),
    /**
     * The date at which the movie is available at the cinema.
     * @see {@link scrapedMoviesTable.availableAt}
     */
    availableAt: date({
      mode: 'date',
    }).notNull(),
    scrapedMovieId: uuid()
      .notNull()
      .references(() => scrapedMoviesTable.id, { onDelete: 'set null' }),
    ...createdAtTimestamp,
  },
  (table) => [
    index().on(table.availableAt),
    unique().on(table.language, table.scrapedMovieId),
    index('idx_movie_translations_language_title').using('gin', sql`${table.language}, ${table.title} gin_trgm_ops`),
  ],
);
