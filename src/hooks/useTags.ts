import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Tag } from '../db/schema'

export function useUserTags(userId: string | null): Tag[] {
  return (
    useLiveQuery(
      () => (userId ? db.tags.where('userId').equals(userId).toArray() : []),
      [userId],
      [],
    ) ?? []
  )
}

export function useTagsMap(): Map<string, Tag> {
  return (
    useLiveQuery(
      () =>
        db.tags.toArray().then((tags) => {
          const map = new Map<string, Tag>()
          for (const tag of tags) {
            if (tag.serverId) map.set(tag.serverId, tag)
          }
          return map
        }),
      [],
      new Map<string, Tag>(),
    ) ?? new Map()
  )
}

export async function createTag(
  data: Pick<Tag, 'name' | 'color' | 'emoji'>,
  userId: string | null,
): Promise<number> {
  const now = new Date()
  const id = await db.tags.add({
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
