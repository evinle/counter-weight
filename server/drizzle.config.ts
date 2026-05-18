import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
})
