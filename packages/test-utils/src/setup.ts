import path from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import db from '@flicker/database';
import { attributesTable } from '@flicker/database/schemas/attributes';
import { moviePerformancesToAttributesTable } from '@flicker/database/schemas/movie-performance-attributes';
import { moviePerformancesTable } from '@flicker/database/schemas/movie-performances';
import { moviesTable } from '@flicker/database/schemas/movies';
import { notificationsTable } from '@flicker/database/schemas/notifications';
import { scrapedMoviesToAttributesTable } from '@flicker/database/schemas/scraped-movie-attributes';
import { scrapedMoviesTable } from '@flicker/database/schemas/scraped-movies';
import { usersTable } from '@flicker/database/schemas/users';

export async function truncateDatabase(): Promise<void> {
  await db.delete(notificationsTable);
  await db.delete(usersTable);
  await db.delete(attributesTable);
  await db.delete(scrapedMoviesToAttributesTable);
  await db.delete(moviePerformancesToAttributesTable);
  await db.delete(moviePerformancesTable);
  await db.delete(moviesTable);
  await db.delete(scrapedMoviesTable);
}

export async function applyPendingMigrations(): Promise<void> {
  const migrationsFolder = path.join(import.meta.dirname, '../../database/drizzle');
  await migrate(db, {
    migrationsFolder,
  });
}
