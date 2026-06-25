import type { GroupsDb, GroupRecord, InsertGroupVals, UpdateGroupVals } from '../../api/routers/groups.js'

export type FakeGroup = GroupRecord
export type FakeGroupsDb = GroupsDb & { groups: FakeGroup[] }

export function createFakeGroupsDb(opts: { groups?: FakeGroup[] } = {}): FakeGroupsDb {
  let idCounter = 0
  const groups: FakeGroup[] = opts.groups ? [...opts.groups] : []

  return {
    groups,

    async insertGroup(vals: InsertGroupVals) {
      idCounter++
      const row: FakeGroup = {
        id: `group-${idCounter}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...vals,
      }
      groups.push(row)
      return { serverId: row.id, version: row.version }
    },

    async updateGroup(where, vals: UpdateGroupVals) {
      const idx = groups.findIndex((g) => {
        if (g.id !== where.id || g.userId !== where.userId) return false
        if (where.version !== undefined && g.version !== where.version) return false
        return true
      })
      if (idx === -1) return null

      const prev = groups[idx]
      const updated: FakeGroup = { ...prev, ...vals, version: prev.version + 1, updatedAt: new Date() }
      groups[idx] = updated
      return { serverId: updated.id, version: updated.version }
    },

    async deleteGroup(where) {
      const idx = groups.findIndex((g) => g.id === where.id && g.userId === where.userId)
      if (idx !== -1) groups.splice(idx, 1)
    },

    async getGroup(id, userId) {
      return groups.find((g) => g.id === id && g.userId === userId) ?? null
    },

    async reconcile(userId, since) {
      return groups.filter((g) => {
        if (g.userId !== userId) return false
        if (since && g.updatedAt <= since) return false
        return true
      })
    },
  }
}
