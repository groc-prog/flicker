import { date, smallint, snakeCase, text } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';

export const scrapedMoviesTable = snakeCase.table('scraped_movies', {
  ...uuidPk,
  /**
   * The ID provided by the cinema API.
   *
   * _Note:_ This value is taken **directly from the scraped data**.
   */
  scrapedMovieId: text().unique().notNull(),
  /** German movie title. */
  title: text().notNull(),
  /**
   * Original title of the movie.
   *
   * _Note:_ Some special events might not this value and will contain `null` instead.
   */
  originalTitle: text(),
  /** Description of what the movie is about. */
  description: text(),
  /** The duration of the movie in minutes. */
  runtime: smallint(),
  /** Path to a static poster asset for the movie. */
  posterPath: text(),
  /**
   * The date at which the movie is available at the cinema.
   *
   * _Note:_ The actual date at which the movie will first be available in the cinema will
   * be `this date + 1`.
   */
  availableAt: date({
    mode: 'date',
  }).notNull(),
  ...createdAtTimestamp,
  ...updatedAtTimestamp,
});
