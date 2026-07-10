import { defineConfig } from 'drizzle-kit';

// Postgres. DATABASE_URL is read from the env when running drizzle-kit
// (generate/migrate/push). Dev AND prod point at Neon — export it from
// backend/.dev.vars before running any db:* script.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101',
  },
});
