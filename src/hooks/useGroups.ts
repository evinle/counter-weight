import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Group, GroupConditions } from '../db/schema'

export function useGroups(userId: string | null): Group[] {
  return (
    useLiveQuery(
      () => (userId ? getGroups(userId) : []),
      [userId],
      [],
    ) ?? []
  )
}

export async function getGroups(userId: string): Promise<Group[]> {
  return db.groups
    .where('userId')
    .equals(userId)
    .filter((g) => g.syncStatus !== SyncStatuses.Deleted)
    .toArray()
}

export async function createGroup(
  data: Pick<Group, 'name' | 'emoji' | 'color' | 'conditions'>,
  userId: string | null,
): Promise<number> {
  const now = new Date()
  const id = await db.groups.add({
    ...data,
    serverId: null,
    userId,
    version: null,
    syncStatus: userId ? SyncStatuses.Pending : SyncStatuses.Synced,
    createdAt: now,
    updatedAt: now,
  })
  return id as number
}

export async function updateGroup(
  id: number,
  data: Partial<Pick<Group, 'name' | 'emoji' | 'color' | 'conditions'>>,
): Promise<void> {
  await db.groups.update(id, { ...data, updatedAt: new Date(), syncStatus: SyncStatuses.Pending })
}

export async function deleteGroup(group: Group): Promise<void> {
  const { id, serverId } = group
  if (id === undefined) return
  if (!serverId) {
    await db.groups.delete(id)
    return
  }
  await db.groups.update(id, { syncStatus: SyncStatuses.Deleted, updatedAt: new Date() })
}
