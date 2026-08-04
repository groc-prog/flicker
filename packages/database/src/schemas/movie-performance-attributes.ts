import { primaryKey, snakeCase, uuid } from 'drizzle-orm/pg-core';

import { attributesTable } from './attributes';
import { moviePerformancesTable } from './movie-performances';

export const performancesToAttributes = snakeCase.table(
  'movie_performances_to_attributes',
  {
    performanceId: uuid()
      .notNull()
      .references(() => moviePerformancesTable.id, { onDelete: 'cascade' }),
    attributeId: uuid()
      .notNull()
      .references(() => attributesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.attributeId, table.performanceId] })],
);
