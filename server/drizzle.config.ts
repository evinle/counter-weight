import { defineConfig } from 'drizzle-kit'

// generate doesn't connect — placeholder lets drizzle-kit generate run without credentials.
// migrate:aws supplies a real URL via scripts/migrate.ts; bare `migrate` still requires DATABASE_URL.
const url = process.env.DATABASE_URL ?? 'NO_DB_URL_FOUND'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
})
