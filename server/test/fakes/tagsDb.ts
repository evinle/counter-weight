import type { TagsDb, TagRecord, InsertTagVals, UpdateTagVals } from '../../api/routers/tags.js'

export type FakeTag = TagRecord
export type FakeTagsDb = TagsDb & { tags: FakeTag[] }

export function createFakeTagsDb(opts: { tags?: FakeTag[] } = {}): FakeTagsDb {
  let idCounter = 0
  const tags: FakeTag[] = opts.tags ? [...opts.tags] : []

  return {
    tags,

    async insertTag(vals: InsertTagVals) {
      idCounter++
      const row: FakeTag = {
        id: `tag-${idCounter}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...vals,
      }
      tags.push(row)
      return { serverId: row.id, version: row.version }
    },

    async updateTag(where, vals: UpdateTagVals) {
      const idx = tags.findIndex((t) => {
        if (t.id !== where.id || t.userId !== where.userId) return false
        if (where.version !== undefined && t.version !== where.version) return false
        return true
      })
      if (idx === -1) return null

      const prev = tags[idx]
      const updated: FakeTag = { ...prev, ...vals, version: prev.version + 1, updatedAt: new Date() }
      tags[idx] = updated
      return { serverId: updated.id, version: updated.version }
    },

    async deleteTag(where) {
      const idx = tags.findIndex((t) => t.id === where.id && t.userId === where.userId)
      if (idx !== -1) tags.splice(idx, 1)
    },

    async getTag(id, userId) {
      return tags.find((t) => t.id === id && t.userId === userId) ?? null
    },

    async reconcile(userId, since) {
      return tags.filter((t) => {
        if (t.userId !== userId) return false
        if (since && t.updatedAt <= since) return false
        return true
      })
    },
  }
}
