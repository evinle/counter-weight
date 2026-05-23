import { describe, it, expect } from 'vitest'
import { migrateV1toV2, migrateV2toV3 } from '../db/migrations'
import type { TimerV1, TimerV2 } from '../db/schema'

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
