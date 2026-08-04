import { uuid } from 'drizzle-orm/pg-core';

export const uuidPk = {
  id: uuid().primaryKey().defaultRandom(),
};
