import { sql } from 'drizzle-orm';
import { timestamp } from 'drizzle-orm/pg-core';

export const createdAtTimestamp = {
  createdAt: timestamp({
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
};

export const updatedAtTimestamp = {
  updatedAt: timestamp({
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => sql`NOW()`),
};
