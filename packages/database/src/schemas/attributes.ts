import { index, pgEnum, snakeCase, text, unique } from 'drizzle-orm/pg-core';

import { createdAtTimestamp, updatedAtTimestamp } from '../utils/timestamp';
import { uuidPk } from '../utils/uuid';

export enum AttributeCategory {
  Fsk = 'fsk',
  SeatClass = 'seatClasses',
  Technical = 'technical',
  Genres = 'genres',
}

export const attributeCategoryEnum = pgEnum('attribute_category', AttributeCategory);

export const attributesTable = snakeCase.table(
  'attributes',
  {
    ...uuidPk,
    /** The category the attribute belongs to. */
    category: attributeCategoryEnum().notNull(),
    /**
     * The display name of the attribute.
     *
     * _Note:_ This is **not a localized value**. The value will depend on the scraped
     * data value.
     */
    name: text().notNull(),
    /**
     * A unique value for a attribute.
     *
     * _Note:_ This value itself does **not have to be unique**, but rather the combination
     * of the category and key make for a unique pair.
     */
    key: text().notNull(),
    ...createdAtTimestamp,
    ...updatedAtTimestamp,
  },
  (table) => [unique().on(table.key, table.category), index().on(table.category, table.id)],
);
