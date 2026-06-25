import { and, eq, gt, sql } from 'drizzle-orm'
import { groups } from '../../db/schema.js'
import type { Db } from '../../db/index.js'
import type { GroupsDb, InsertGroupVals, UpdateGroupVals } from './groups.js'

export function createGroupsDb(db: Db): GroupsDb {
  return {
    async insertGroup(vals: InsertGroupVals) {
      const [row] = await db
        .insert(groups)
        .values(vals)
        .returning({ serverId: groups.id, version: groups.version })
      return row
    },

    async updateGroup(where, vals: UpdateGroupVals) {
      const whereClause =
        where.version !== undefined
          ? and(eq(groups.id, where.id), eq(groups.userId, where.userId), eq(groups.version, where.version))
          : and(eq(groups.id, where.id), eq(groups.userId, where.userId))

      const [row] = await db
        .update(groups)
        .set({ ...vals, version: sql`${groups.version} + 1`, updatedAt: new Date() })
        .where(whereClause)
        .returning({ serverId: groups.id, version: groups.version })

      return row ?? null
    },

    async deleteGroup(where) {
      await db.delete(groups).where(and(eq(groups.id, where.id), eq(groups.userId, where.userId)))
    },

    async getGroup(id, userId) {
      const [row] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.userId, userId)))
      return row ?? null
    },

    async reconcile(userId, since) {
      const conditions = [eq(groups.userId, userId)]
      if (since) conditions.push(gt(groups.updatedAt, since))
      return db.select().from(groups).where(and(...conditions))
    },
  }
}
