import { and, eq, gt, sql } from 'drizzle-orm'
import { tags, timerTags } from '../../db/schema.js'
import type { Db } from '../../db/index.js'
import type { TagsDb, InsertTagVals, UpdateTagVals } from './tags.js'

export function createTagsDb(db: Db): TagsDb {
  return {
    async insertTag(vals: InsertTagVals) {
      const [row] = await db
        .insert(tags)
        .values(vals)
        .returning({ serverId: tags.id, version: tags.version })
      return row
    },

    async updateTag(where, vals: UpdateTagVals) {
      const whereClause =
        where.version !== undefined
          ? and(eq(tags.id, where.id), eq(tags.userId, where.userId), eq(tags.version, where.version))
          : and(eq(tags.id, where.id), eq(tags.userId, where.userId))

      const [row] = await db
        .update(tags)
        .set({ ...vals, version: sql`${tags.version} + 1`, updatedAt: new Date() })
        .where(whereClause)
        .returning({ serverId: tags.id, version: tags.version })

      return row ?? null
    },

    async deleteTag(where) {
      await db.transaction(async (tx) => {
        await tx.delete(timerTags).where(eq(timerTags.tagId, where.id))
        await tx.delete(tags).where(and(eq(tags.id, where.id), eq(tags.userId, where.userId)))
      })
    },

    async getTag(id, userId) {
      const [row] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      return row ?? null
    },

    async reconcile(userId, since) {
      const conditions = [eq(tags.userId, userId)]
      if (since) conditions.push(gt(tags.updatedAt, since))
      return db.select().from(tags).where(and(...conditions))
    },
  }
}
