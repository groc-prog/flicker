import { index, snakeCase, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';
import { moviesTable } from './movies';
import { scrapedMoviesTable } from './scraped-movies';

export const moviePerformancesTable = snakeCase.table(
  'movie_performances',
  {
    ...uuidPk,
    /**
     * The ID provided by the cinema API.
     *
     * _Note:_ This value is taken **directly from the scraped data**.
     */
    scrapedPerformanceId: text().unique().notNull(),
    /**
     * The name of the theatre the movie is shown in.
     * @example Saal 1
     */
    theatre: text().notNull(),
    /**
     * A deep-link to the booking UI.
     *
     * _Note:_ Usage of this link can be risky as this is most likely not
     * intended to be called directly but rather embedded somewhere else.
     */
    seatingDeepLink: text().notNull(),
    /** The UTC date at which the movie is shown. */
    showtime: timestamp({
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }).notNull(),
    scrapedMovieId: uuid()
      .references(() => scrapedMoviesTable.id, { onDelete: 'cascade' })
      .notNull(),
    movieId: uuid().references(() => moviesTable.id, { onDelete: 'cascade' }),
    ...createdAtTimestamp,
    ...updatedAtTimestamp,
  },
  (table) => [index().on(table.showtime)],
);
