import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schemas',
  dbCredentials: {
    url: process.env.POSTGRES_DATABASE_URL,
  },
});
