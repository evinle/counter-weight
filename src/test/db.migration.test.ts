import { describe, it, expect } from 'vitest'
import { migrateV1toV2, migrateV2toV3, migrateV5toV6 } from '../db/migrations'
import type { TimerV1, TimerV2, TimerV5 } from '../db/schema'

const V1_FIXTURE = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
} satisfies TimerV1

describe('migrateV1toV2', () => {
  it('copies targetDatetime into originalTargetDatetime', () => {
    const v2 = migrateV1toV2(V1_FIXTURE)
    expect(v2.originalTargetDatetime).toBe(V1_FIXTURE.targetDatetime)
  })

  it('preserves all V1 fields', () => {
    const v2 = migrateV1toV2(V1_FIXTURE)
    expect(v2.title).toBe('Test')
    expect(v2.status).toBe('active')
    expect(v2.groupId).toBeNull()
  })
})

const V5_FIXTURE = {
  title: 'My task',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  serverId: null,
  userId: null,
  syncStatus: 'synced',
  version: null,
  tagIds: ['tag-a', 'tag-b'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
} satisfies TimerV5

describe('migrateV5toV6', () => {
  it('defaults timerType to reminder', () => {
    expect(migrateV5toV6(V5_FIXTURE).timerType).toBe('reminder')
  })

  it('defaults leadTimeMs to null', () => {
    expect(migrateV5toV6(V5_FIXTURE).leadTimeMs).toBeNull()
  })

  it('defaults workSessions to empty array', () => {
    expect(migrateV5toV6(V5_FIXTURE).workSessions).toEqual([])
  })

  it('preserves V5 fields', () => {
    const v6 = migrateV5toV6(V5_FIXTURE)
    expect(v6.title).toBe('My task')
    expect(v6.status).toBe('active')
    expect(v6.tagIds).toEqual(['tag-a', 'tag-b'])
  })
})

describe('migrateV2toV3', () => {
  const V2_FIXTURE = {
    ...V1_FIXTURE,
    originalTargetDatetime: V1_FIXTURE.targetDatetime,
  } satisfies TimerV2

  it('sets serverId to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).serverId).toBeNull()
  })

  it('sets userId to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).userId).toBeNull()
  })

  it('sets syncStatus to synced', () => {
    expect(migrateV2toV3(V2_FIXTURE).syncStatus).toBe('synced')
  })

  it('sets version to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).version).toBeNull()
  })

  it('preserves all V2 fields', () => {
    const v3 = migrateV2toV3(V2_FIXTURE)
    expect(v3.title).toBe('Test')
    expect(v3.originalTargetDatetime).toBe(V1_FIXTURE.targetDatetime)
  })
})
