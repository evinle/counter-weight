import { and, eq, gt, ne, sql } from 'drizzle-orm'
import { timers, timerEvents } from '../../db/schema.js'
import type { EventType } from '../../db/schema.js'
import type { Db } from '../../db/index.js'
import type { TimersDb, InsertTimerVals, UpdateTimerVals } from './timers.js'

export function createTimersDb(db: Db): TimersDb {
  return {
    async listActive(userId) {
      return db
        .select()
        .from(timers)
        .where(and(eq(timers.userId, userId), ne(timers.status, 'cancelled')))
    },

    async getTimer(id, userId) {
      const [row] = await db
        .select()
        .from(timers)
        .where(and(eq(timers.id, id), eq(timers.userId, userId)))
      return row ?? null
    },

    async insertTimer(vals: InsertTimerVals) {
      const [row] = await db
        .insert(timers)
        .values(vals)
        .returning({ serverId: timers.id, version: timers.version })
      return row
    },

    async updateTimer(where, vals: UpdateTimerVals) {
      const whereClause =
        where.version !== undefined
          ? and(
              eq(timers.id, where.id),
              eq(timers.userId, where.userId),
              eq(timers.version, where.version),
            )
          : and(eq(timers.id, where.id), eq(timers.userId, where.userId))

      const [row] = await db
        .update(timers)
        .set({
          ...vals,
          version: sql`${timers.version} + 1`,
          updatedAt: new Date(),
        })
        .where(whereClause)
        .returning({ serverId: timers.id, version: timers.version })

      return row ?? null
    },

    async setStatus(where, status) {
      const [row] = await db
        .update(timers)
        .set({ status, version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(timers.id, where.id),
            eq(timers.userId, where.userId),
            eq(timers.version, where.version),
          ),
        )
        .returning({ id: timers.id })

      return row ?? null
    },

    async insertTimerEvent(vals) {
      await db.insert(timerEvents).values(vals)
    },

    async reconcile(userId, since) {
      const conditions = [eq(timers.userId, userId)]
      if (since) conditions.push(gt(timers.updatedAt, since))

      // Cancelled timers are intentionally included — clients need them to tombstone local copies
      return db.select().from(timers).where(and(...conditions))
    },
  }
}
