import { describe, it, expect, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { tagsRouter } from './tags.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import { createFakeDb } from '../../test/fakes/db.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { TagRecord } from './tags.js'

const testRouter = router({ tags: tagsRouter })
const createCaller = createCallerFactory(testRouter)

const EXISTING_TAG = {
  id: '00000000-0000-0000-0000-000000000011',
  userId: 'u1',
  name: 'urgent',
  color: '#ff0000',
  emoji: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TagRecord

function makeCtx(userId: string | null, tagsDb: FakeTagsDb) {
  return {
    userId,
    db: createFakeDb(),
    timersDb: createFakeTimersDb(),
    tagsDb,
    scheduler: createFakeScheduler(),
    userAgent: null,
  }
}

let fakeTagsDb: FakeTagsDb

beforeEach(() => {
  mockEnv()
  fakeTagsDb = createFakeTagsDb()
})

describe('tags.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller(makeCtx(null, fakeTagsDb))
    await expect(
      caller.tags.upsert({ serverId: null, name: 'urgent', color: null, emoji: null }),
    ).rejects.toThrow(TRPCError)
  })

  it('inserts a new tag and returns serverId + version', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.upsert({ serverId: null, name: 'urgent', color: '#ff0000', emoji: null })

    // Assert
    expect(fakeTagsDb.tags).toHaveLength(1)
    expect(fakeTagsDb.tags[0]).toMatchObject({ userId: 'u1', name: 'urgent', color: '#ff0000' })
    expect(result.serverId).toBe(fakeTagsDb.tags[0].id)
    expect(result.version).toBe(1)
  })

  it('throws CONFLICT when version does not match', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act / Assert
    await expect(
      caller.tags.upsert({ serverId: EXISTING_TAG.id, name: 'updated', color: null, emoji: null, version: 99 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('updates an existing tag and bumps version', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.upsert({
      serverId: EXISTING_TAG.id,
      name: 'critical',
      color: '#990000',
      emoji: '🔥',
      version: 1,
    })

    // Assert
    expect(fakeTagsDb.tags[0]).toMatchObject({ name: 'critical', color: '#990000', emoji: '🔥' })
    expect(result.version).toBe(2)
  })
})

describe('tags.delete', () => {
  it('removes the tag', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.delete({ serverId: EXISTING_TAG.id })

    // Assert
    expect(result).toEqual({ ok: true })
    expect(fakeTagsDb.tags).toHaveLength(0)
  })

  it('cascades: removes timer_tags rows for the deleted tag', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({
      tags: [EXISTING_TAG],
      timerTags: [
        { timerId: 'timer-1', tagId: EXISTING_TAG.id },
        { timerId: 'timer-2', tagId: EXISTING_TAG.id },
      ],
    })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    await caller.tags.delete({ serverId: EXISTING_TAG.id })

    // Assert
    expect(fakeTagsDb.timerTags).toHaveLength(0)
  })
})

describe('tags.reconcile', () => {
  it('returns tags and serverNow', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.reconcile({ since: null, records: [] })

    // Assert
    expect(result).toHaveProperty('serverNow')
    expect(typeof result.serverNow).toBe('string')
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].id).toBe(EXISTING_TAG.id)
  })

  it('since: <T> returns only tags updated after T', async () => {
    // Arrange
    const oldTag = { ...EXISTING_TAG, id: '00000000-0000-0000-0000-000000000012', updatedAt: new Date('2026-01-01T00:00:00Z') }
    const newTag = { ...EXISTING_TAG, id: '00000000-0000-0000-0000-000000000013', updatedAt: new Date('2026-06-01T00:00:00Z') }
    fakeTagsDb = createFakeTagsDb({ tags: [oldTag, newTag] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.reconcile({ since: '2026-03-01T00:00:00Z', records: [] })

    // Assert
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].id).toBe(newTag.id)
  })

  it('since: null filters by userId only', async () => {
    // Arrange
    const otherUserTag = { ...EXISTING_TAG, id: '00000000-0000-0000-0000-000000000014', userId: 'u2' }
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG, otherUserTag] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb))

    // Act
    const result = await caller.tags.reconcile({ since: null, records: [] })

    // Assert
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].id).toBe(EXISTING_TAG.id)
  })
})
