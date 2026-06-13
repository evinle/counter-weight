import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { timers, timerEvents, timerTags } from "../../db/schema.js";
import { TimerStatus } from "../../db/schema.js";
import type { Db } from "../../db/index.js";
import type { TimersDb, InsertTimerVals, UpdateTimerVals, TimerRecord } from "./timers.js";

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

async function syncTimerTags(tx: Tx, timerId: string, newTagIds: string[]): Promise<void> {
  const current = await tx
    .select({ tagId: timerTags.tagId })
    .from(timerTags)
    .where(eq(timerTags.timerId, timerId))
  const currentIds = current.map((r) => r.tagId)
  const newSet = new Set(newTagIds)
  const currentSet = new Set(currentIds)

  const toDelete = currentIds.filter((id) => !newSet.has(id))
  const toInsert = newTagIds.filter((id) => !currentSet.has(id))

  if (toDelete.length > 0) {
    await tx.delete(timerTags).where(
      and(eq(timerTags.timerId, timerId), inArray(timerTags.tagId, toDelete)),
    )
  }
  if (toInsert.length > 0) {
    await tx.insert(timerTags).values(toInsert.map((tagId) => ({ timerId, tagId })))
  }
}

async function attachTagIds(db: Db, timerRows: Omit<TimerRecord, 'tagIds'>[]): Promise<TimerRecord[]> {
  if (timerRows.length === 0) return []
  const timerIds = timerRows.map((t) => t.id)
  const tagRows = await db
    .select({ timerId: timerTags.timerId, tagId: timerTags.tagId })
    .from(timerTags)
    .where(inArray(timerTags.timerId, timerIds))
  const tagMap = new Map<string, string[]>()
  for (const { timerId, tagId } of tagRows) {
    const existing = tagMap.get(timerId) ?? []
    existing.push(tagId)
    tagMap.set(timerId, existing)
  }
  return timerRows.map((t) => ({ ...t, tagIds: tagMap.get(t.id) ?? [] }))
}

export function createTimersDb(db: Db): TimersDb {
  return {
    async listActive(userId) {
      const rows = await db
        .select()
        .from(timers)
        .where(and(eq(timers.userId, userId), ne(timers.status, TimerStatus.Cancelled)))
      return attachTagIds(db, rows)
    },

    async getTimer(id, userId) {
      const [row] = await db
        .select()
        .from(timers)
        .where(and(eq(timers.id, id), eq(timers.userId, userId)))
      if (!row) return null
      const [withTags] = await attachTagIds(db, [row])
      return withTags
    },

    async insertTimer(vals: InsertTimerVals) {
      const { tagIds, ...timerVals } = vals
      const [row] = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(timers)
          .values(timerVals)
          .returning({ serverId: timers.id, version: timers.version })
        await syncTimerTags(tx, inserted[0].serverId, tagIds)
        return inserted
      })
      return { ...row, tagIds }
    },

    async updateTimer(where, vals: UpdateTimerVals) {
      const { tagIds, ...timerVals } = vals
      const whereClause =
        where.version !== undefined
          ? and(eq(timers.id, where.id), eq(timers.userId, where.userId), eq(timers.version, where.version))
          : and(eq(timers.id, where.id), eq(timers.userId, where.userId))

      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(timers)
          .set({ ...timerVals, version: sql`${timers.version} + 1`, updatedAt: new Date() })
          .where(whereClause)
          .returning({ serverId: timers.id, version: timers.version })
        if (!row) return null
        await syncTimerTags(tx, row.serverId, tagIds)
        return { ...row, tagIds }
      })

      return result
    },

    async setStatus(where, status) {
      const [row] = await db
        .update(timers)
        .set({ status, version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(and(eq(timers.id, where.id), eq(timers.userId, where.userId), eq(timers.version, where.version)))
        .returning({ id: timers.id })
      return row ?? null
    },

    async insertTimerEvent(vals) {
      await db.insert(timerEvents).values(vals)
    },

    async reconcile(userId, since) {
      const conditions = [eq(timers.userId, userId)]
      if (since) conditions.push(gt(timers.updatedAt, since))

      // Cancelled timers intentionally included — clients need them to tombstone local copies
      const rows = await db.select().from(timers).where(and(...conditions))
      return attachTagIds(db, rows)
    },
  }
}
