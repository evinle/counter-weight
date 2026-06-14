import 'fake-indexeddb/auto'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Tag, Timer } from '../db/schema'
import { deleteTag } from '../hooks/useTags'

const BASE_TAG = {
  serverId: 'srv-tag-1',
  userId: 'user-1',
  name: 'Work',
  color: '#3b82f6',
  emoji: null,
  version: 1,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Tag, 'id'>

const BASE_TIMER = {
  title: 'Test Timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  recurrenceRule: null,
  serverId: 'srv-timer-1',
  userId: 'user-1',
  syncStatus: SyncStatuses.Synced,
  version: 1,
  tagIds: ['srv-tag-1'],
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Timer, 'id'>

beforeEach(async () => {
  await db.tags.clear()
  await db.timers.clear()
})

describe('deleteTag', () => {
  it('marks a synced tag as deleted without hard-deleting it', async () => {
    const id = await db.tags.add({ ...BASE_TAG })

    await deleteTag({ ...BASE_TAG, id })

    const tag = await db.tags.get(id)
    expect(tag).toBeDefined()
    expect(tag?.syncStatus).toBe(SyncStatuses.Deleted)
  })

  it('hard-deletes an unsynced tag immediately', async () => {
    const id = await db.tags.add({
      ...BASE_TAG,
      serverId: null,
      syncStatus: SyncStatuses.Pending,
    })

    await deleteTag({ ...BASE_TAG, id, serverId: null, syncStatus: SyncStatuses.Pending })

    const tag = await db.tags.get(id)
    expect(tag).toBeUndefined()
  })

  it('scrubs the deleted serverId from timer.tagIds and marks timer pending', async () => {
    const tagId = await db.tags.add({ ...BASE_TAG })
    const timerId = await db.timers.add({ ...BASE_TIMER, tagIds: ['srv-tag-1', 'srv-tag-other'] })

    await deleteTag({ ...BASE_TAG, id: tagId })

    const timer = await db.timers.get(timerId)
    expect(timer?.tagIds).toEqual(['srv-tag-other'])
    expect(timer?.syncStatus).toBe(SyncStatuses.Pending)
  })

  it('does not touch timers that do not reference the deleted tag', async () => {
    const tagId = await db.tags.add({ ...BASE_TAG })
    const unrelatedTimerId = await db.timers.add({
      ...BASE_TIMER,
      tagIds: ['srv-tag-other'],
      syncStatus: SyncStatuses.Synced,
    })

    await deleteTag({ ...BASE_TAG, id: tagId })

    const timer = await db.timers.get(unrelatedTimerId)
    expect(timer?.tagIds).toEqual(['srv-tag-other'])
    expect(timer?.syncStatus).toBe(SyncStatuses.Synced)
  })
})
