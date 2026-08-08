import { primaryKey, snakeCase, uuid } from 'drizzle-orm/pg-core';

import { attributesTable } from './attributes';
import { scrapedMoviesTable } from './scraped-movies';

export const scrapedMoviesToAttributesTable = snakeCase.table(
  'scraped_movies_to_attributes',
  {
    scrapedMovieId: uuid()
      .notNull()
      .references(() => scrapedMoviesTable.id, { onDelete: 'cascade' }),
    attributeId: uuid()
      .notNull()
      .references(() => attributesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.attributeId, table.scrapedMovieId] })],
);
