import { describe, it, expect } from 'vitest'
import { applyFilter } from './evaluator.ts'
import type { Timer } from '../../../src/db/schema.ts'
import type { GroupConditions } from './schema.ts'

const NOW = new Date('2026-06-14T12:00:00Z')

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: 1,
    title: 'Test timer',
    description: null,
    emoji: null,
    targetDatetime: new Date('2026-06-15T12:00:00Z'),
    status: 'active',
    priority: 'medium',
    recurrenceRule: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    originalTargetDatetime: new Date('2026-06-15T12:00:00Z'),
    serverId: null,
    userId: null,
    syncStatus: 'pending',
    version: null,
    tagIds: [],
    ...overrides,
  } satisfies Timer
}

const AND = (conditions: GroupConditions['conditions']): GroupConditions => ({ op: 'AND', conditions })

describe('applyFilter', () => {
  it('returns all timers when conditions array is empty', () => {
    const timers = [makeTimer({ id: 1 }), makeTimer({ id: 2 })]
    expect(applyFilter(timers, AND([]), NOW)).toEqual(timers)
  })

  it('tags.contains — keeps timers whose tagIds includes the value', () => {
    const match = makeTimer({ id: 1, tagIds: ['tag-a', 'tag-b'] })
    const noMatch = makeTimer({ id: 2, tagIds: ['tag-c'] })
    expect(applyFilter([match, noMatch], AND([{ field: 'tags', op: 'contains', value: 'tag-a' }]), NOW))
      .toEqual([match])
  })

  it('priority.eq — keeps timers with exact priority', () => {
    const match = makeTimer({ id: 1, priority: 'high' })
    const noMatch = makeTimer({ id: 2, priority: 'low' })
    expect(applyFilter([match, noMatch], AND([{ field: 'priority', op: 'eq', value: 'high' }]), NOW))
      .toEqual([match])
  })

  it('priority.in — keeps timers whose priority is in the list', () => {
    const match1 = makeTimer({ id: 1, priority: 'high' })
    const match2 = makeTimer({ id: 2, priority: 'critical' })
    const noMatch = makeTimer({ id: 3, priority: 'low' })
    expect(applyFilter([match1, match2, noMatch], AND([{ field: 'priority', op: 'in', value: ['high', 'critical'] }]), NOW))
      .toEqual([match1, match2])
  })

  it('status.eq — keeps timers with exact status', () => {
    const match = makeTimer({ id: 1, status: 'fired' })
    const noMatch = makeTimer({ id: 2, status: 'active' })
    expect(applyFilter([match, noMatch], AND([{ field: 'status', op: 'eq', value: 'fired' }]), NOW))
      .toEqual([match])
  })

  it('status.in — keeps timers whose status is in the list', () => {
    const match1 = makeTimer({ id: 1, status: 'completed' })
    const match2 = makeTimer({ id: 2, status: 'cancelled' })
    const noMatch = makeTimer({ id: 3, status: 'active' })
    expect(applyFilter([match1, match2, noMatch], AND([{ field: 'status', op: 'in', value: ['completed', 'cancelled'] }]), NOW))
      .toEqual([match1, match2])
  })

  it('targetDatetime.before — keeps timers before the given ISO string', () => {
    const match = makeTimer({ id: 1, targetDatetime: new Date('2026-06-10T00:00:00Z') })
    const noMatch = makeTimer({ id: 2, targetDatetime: new Date('2026-06-20T00:00:00Z') })
    expect(applyFilter([match, noMatch], AND([{ field: 'targetDatetime', op: 'before', value: '2026-06-14T00:00:00Z' }]), NOW))
      .toEqual([match])
  })

  it('targetDatetime.after — keeps timers after the given ISO string', () => {
    const match = makeTimer({ id: 1, targetDatetime: new Date('2026-06-20T00:00:00Z') })
    const noMatch = makeTimer({ id: 2, targetDatetime: new Date('2026-06-10T00:00:00Z') })
    expect(applyFilter([match, noMatch], AND([{ field: 'targetDatetime', op: 'after', value: '2026-06-14T00:00:00Z' }]), NOW))
      .toEqual([match])
  })

  it('targetDatetime.overdue — keeps timers whose targetDatetime is before now', () => {
    const match = makeTimer({ id: 1, targetDatetime: new Date('2026-06-14T11:59:00Z') })
    const noMatch = makeTimer({ id: 2, targetDatetime: new Date('2026-06-14T13:00:00Z') })
    expect(applyFilter([match, noMatch], AND([{ field: 'targetDatetime', op: 'overdue' }]), NOW))
      .toEqual([match])
  })

  it('targetDatetime.today — keeps timers on the same calendar day as now', () => {
    const match = makeTimer({ id: 1, targetDatetime: new Date('2026-06-14T09:00:00Z') })
    const noMatch = makeTimer({ id: 2, targetDatetime: new Date('2026-06-15T00:00:00Z') })
    expect(applyFilter([match, noMatch], AND([{ field: 'targetDatetime', op: 'today' }]), NOW))
      .toEqual([match])
  })

  it('targetDatetime.within_days — keeps timers within N days from now', () => {
    const match = makeTimer({ id: 1, targetDatetime: new Date('2026-06-16T12:00:00Z') }) // 2 days out
    const noMatch = makeTimer({ id: 2, targetDatetime: new Date('2026-06-20T12:00:00Z') }) // 6 days out
    const past = makeTimer({ id: 3, targetDatetime: new Date('2026-06-13T00:00:00Z') }) // before now
    expect(applyFilter([match, noMatch, past], AND([{ field: 'targetDatetime', op: 'within_days', value: 3 }]), NOW))
      .toEqual([match])
  })

  it('title.contains — case-insensitive substring match', () => {
    const match = makeTimer({ id: 1, title: 'Deploy to Production' })
    const noMatch = makeTimer({ id: 2, title: 'Morning standup' })
    expect(applyFilter([match, noMatch], AND([{ field: 'title', op: 'contains', value: 'production' }]), NOW))
      .toEqual([match])
  })

  it('recurrenceRule.exists — keeps timers with a recurrence rule', () => {
    const match = makeTimer({ id: 1, recurrenceRule: { cron: '0 9 * * 1', tz: 'UTC' } })
    const noMatch = makeTimer({ id: 2, recurrenceRule: null })
    expect(applyFilter([match, noMatch], AND([{ field: 'recurrenceRule', op: 'exists' }]), NOW))
      .toEqual([match])
  })

  it('recurrenceRule.not_exists — keeps timers without a recurrence rule', () => {
    const match = makeTimer({ id: 1, recurrenceRule: null })
    const noMatch = makeTimer({ id: 2, recurrenceRule: { cron: '0 9 * * 1', tz: 'UTC' } })
    expect(applyFilter([match, noMatch], AND([{ field: 'recurrenceRule', op: 'not_exists' }]), NOW))
      .toEqual([match])
  })

  it('emoji.eq — keeps timers with matching emoji', () => {
    const match = makeTimer({ id: 1, emoji: '🔥' })
    const noMatch = makeTimer({ id: 2, emoji: '⏰' })
    const nullEmoji = makeTimer({ id: 3, emoji: null })
    expect(applyFilter([match, noMatch, nullEmoji], AND([{ field: 'emoji', op: 'eq', value: '🔥' }]), NOW))
      .toEqual([match])
  })

  it('multiple AND conditions — timer must satisfy all', () => {
    const match = makeTimer({ id: 1, priority: 'high', status: 'active', tagIds: ['tag-x'] })
    const wrongPriority = makeTimer({ id: 2, priority: 'low', status: 'active', tagIds: ['tag-x'] })
    const wrongTag = makeTimer({ id: 3, priority: 'high', status: 'active', tagIds: [] })
    expect(applyFilter(
      [match, wrongPriority, wrongTag],
      AND([
        { field: 'priority', op: 'eq', value: 'high' },
        { field: 'tags', op: 'contains', value: 'tag-x' },
      ]),
      NOW,
    )).toEqual([match])
  })
})
