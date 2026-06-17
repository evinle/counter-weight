import { describe, it, expect } from 'vitest'
import { sortTimers, SortModes } from '../lib/sort'
import type { SortMode, SortDirection } from '../lib/sort'
import { SyncStatuses } from '../db/schema'
import type { Timer } from '../db/schema'

const NOW = new Date('2026-06-17T12:00:00Z')

const BASE_TIMER: Omit<Timer, 'id' | 'title' | 'priority' | 'targetDatetime' | 'createdAt'> = {
  description: null,
  emoji: null,
  originalTargetDatetime: new Date('2026-06-20T12:00:00Z'),
  status: 'active',
  recurrenceRule: null,
  serverId: null,
  userId: 'user-1',
  syncStatus: SyncStatuses.Synced,
  version: null,
  tagIds: [],
  updatedAt: NOW,
}

function makeTimer(overrides: Pick<Timer, 'title' | 'priority' | 'targetDatetime' | 'createdAt'> & Partial<Timer>): Timer {
  return { id: 1, ...BASE_TIMER, ...overrides } satisfies Timer
}

const FIXTURE_TIMERS: Timer[] = [
  makeTimer({ title: 'Alpha', priority: 'low',      targetDatetime: new Date('2026-06-20T00:00:00Z'), createdAt: new Date('2026-06-01T00:00:00Z') }),
  makeTimer({ title: 'Beta',  priority: 'high',     targetDatetime: new Date('2026-06-19T00:00:00Z'), createdAt: new Date('2026-06-05T00:00:00Z') }),
  makeTimer({ title: 'Gamma', priority: 'critical', targetDatetime: new Date('2026-06-25T00:00:00Z'), createdAt: new Date('2026-06-10T00:00:00Z') }),
  makeTimer({ title: 'Delta', priority: 'medium',   targetDatetime: new Date('2026-06-18T00:00:00Z'), createdAt: new Date('2026-06-15T00:00:00Z') }),
]

const ALL_MODES = Object.values(SortModes) as SortMode[]

describe('sortTimers — direction reversal', () => {
  it.each(ALL_MODES)('asc produces the reverse of desc for mode "%s"', (mode) => {
    const desc = sortTimers(FIXTURE_TIMERS, mode, 'desc', NOW)
    const asc = sortTimers(FIXTURE_TIMERS, mode, 'asc', NOW)
    expect(asc.map(t => t.title)).toEqual([...desc.map(t => t.title)].reverse())
  })
})

describe('sortTimers — field ordering (desc)', () => {
  it('targetDatetime: soonest last', () => {
    const result = sortTimers(FIXTURE_TIMERS, 'targetDatetime', 'desc', NOW)
    const dates = result.map(t => t.targetDatetime.getTime())
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('priority: critical first', () => {
    const result = sortTimers(FIXTURE_TIMERS, 'priority', 'desc', NOW)
    expect(result[0].priority).toBe('critical')
    expect(result[result.length - 1].priority).toBe('low')
  })

  it('title: Z before A', () => {
    const result = sortTimers(FIXTURE_TIMERS, 'title', 'desc', NOW)
    const titles = result.map(t => t.title)
    expect(titles).toEqual([...titles].sort((a, b) => b.localeCompare(a)))
  })
})

describe('sortTimers — smart desc', () => {
  it('surfaces a low-priority imminent timer above a critical far-future timer', () => {
    const criticalFar = makeTimer({
      title: 'Critical far',
      priority: 'critical',
      targetDatetime: new Date('2026-06-21T12:00:00Z'), // 4 days away
      createdAt: NOW,
    })
    const lowImminent = makeTimer({
      title: 'Low imminent',
      priority: 'low',
      targetDatetime: new Date('2026-06-17T12:10:00Z'), // 10 min away
      createdAt: NOW,
    })

    const result = sortTimers([criticalFar, lowImminent], 'smart', 'desc', NOW)

    expect(result[0].title).toBe('Low imminent')
  })

  it('surfaces an overdue timer above a same-priority future timer', () => {
    const overdue = makeTimer({
      title: 'Overdue',
      priority: 'medium',
      targetDatetime: new Date('2026-06-16T12:00:00Z'), // 24h ago
      createdAt: NOW,
    })
    const future = makeTimer({
      title: 'Future',
      priority: 'medium',
      targetDatetime: new Date('2026-06-18T12:00:00Z'), // 24h away
      createdAt: NOW,
    })

    const result = sortTimers([future, overdue], 'smart', 'desc', NOW)

    expect(result[0].title).toBe('Overdue')
  })
})
