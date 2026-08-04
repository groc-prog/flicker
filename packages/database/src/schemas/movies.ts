import { boolean, date, decimal, index, integer, snakeCase, text, uuid } from 'drizzle-orm/pg-core';

import { createdAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { scrapedMoviesTable } from './scraped-movies';

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
    /** The link to a poster image. */
    posterPath: text(),
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
      .unique()
      .notNull()
      .references(() => scrapedMoviesTable.id, { onDelete: 'set null' }),
    ...createdAtTimestamp,
  },
  (table) => [index().on(table.availableAt)],
);
