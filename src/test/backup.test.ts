import { describe, it, expect } from 'vitest'
import { exportTimers, importTimers } from '../lib/backup'
import type { Timer } from '../db/schema'

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    title: 'Test Timer',
    description: null,
    emoji: '⏰',
    targetDatetime: new Date('2026-06-01T10:00:00.000Z'),
    originalTargetDatetime: new Date('2026-06-01T10:00:00.000Z'),
    status: 'active',
    priority: 'medium',
    isFlagged: false,
    groupId: null,
    recurrenceRule: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('exportTimers', () => {
  it('produces a valid JSON envelope with version 1', () => {
    const json = exportTimers([makeTimer()])
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(Array.isArray(parsed.timers)).toBe(true)
    expect(parsed.timers).toHaveLength(1)
  })

  it('serialises dates as ISO strings', () => {
    const json = exportTimers([makeTimer()])
    const parsed = JSON.parse(json)
    const t = parsed.timers[0]
    expect(typeof t.targetDatetime).toBe('string')
    expect(typeof t.createdAt).toBe('string')
    expect(new Date(t.targetDatetime).toISOString()).toBe('2026-06-01T10:00:00.000Z')
  })

  it('includes timers with id field when present', () => {
    const json = exportTimers([makeTimer({ id: 42 })])
    const parsed = JSON.parse(json)
    expect(parsed.timers[0].id).toBe(42)
  })
})

describe('importTimers', () => {
  it('round-trips exported timers back to Timer[]', () => {
    const original = makeTimer({ id: 1 })
    const json = exportTimers([original])
    const { timers, skipped } = importTimers(json)
    expect(skipped).toBe(0)
    expect(timers).toHaveLength(1)
    expect(timers[0].title).toBe('Test Timer')
    expect(timers[0].targetDatetime).toBeInstanceOf(Date)
  })

  it('strips id from imported timers', () => {
    const json = exportTimers([makeTimer({ id: 99 })])
    const { timers } = importTimers(json)
    expect('id' in timers[0]).toBe(false)
  })

  it('handles unknown version as best-effort with handleDefault', () => {
    const envelope = JSON.stringify({
      version: 999,
      exportedAt: new Date().toISOString(),
      timers: [makeTimer({ targetDatetime: new Date('2026-06-01T10:00:00.000Z') })].map(t => ({
        ...t,
        targetDatetime: t.targetDatetime.toISOString(),
        originalTargetDatetime: t.originalTargetDatetime.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })
    const { timers, skipped } = importTimers(envelope)
    expect(timers).toHaveLength(1)
    expect(skipped).toBe(0)
  })

  it('skips records missing required fields and counts them', () => {
    const envelope = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      timers: [
        { title: 'Valid', status: 'active', targetDatetime: '2026-06-01T10:00:00.000Z', priority: 'medium' },
        { title: 'No status' },
        { status: 'active' },
      ],
    })
    const { timers, skipped } = importTimers(envelope)
    expect(timers).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  it('throws on invalid JSON', () => {
    expect(() => importTimers('not json')).toThrow('Invalid JSON file')
  })

  it('throws when version field is missing', () => {
    expect(() => importTimers(JSON.stringify({ timers: [] }))).toThrow('Missing version field')
  })

  it('throws when timers array is missing', () => {
    expect(() => importTimers(JSON.stringify({ version: 1 }))).toThrow('Missing timers array')
  })
})
