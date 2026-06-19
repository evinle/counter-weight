import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createScheduler, NotifyKind } from '../sw.scheduler'
import type { SyncTimerEntry } from '../sw.scheduler'

const NOW = new Date('2026-06-19T12:00:00.000Z')

const BASE: SyncTimerEntry = {
  id: 1,
  serverId: null,
  title: 'Standup',
  emoji: undefined,
  targetDatetime: new Date(NOW.getTime() + 60_000).toISOString(),
  leadTimeMs: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('lead timeout', () => {
  it('fires lead notification at targetDatetime minus leadTimeMs', () => {
    const notify = vi.fn()
    const scheduler = createScheduler({ notify })
    const timer: SyncTimerEntry = { ...BASE, leadTimeMs: 30_000 }

    scheduler.sync([timer])
    vi.advanceTimersByTime(30_000) // fires lead (60s - 30s = 30s from now)

    expect(notify).toHaveBeenCalledWith(timer, NotifyKind.Lead)
    expect(notify).not.toHaveBeenCalledWith(timer, NotifyKind.Deadline)
  })

  it('skips lead when leadTimeMs is null', () => {
    const notify = vi.fn()
    const scheduler = createScheduler({ notify })

    scheduler.sync([BASE]) // leadTimeMs: null
    vi.advanceTimersByTime(60_000)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(BASE, NotifyKind.Deadline)
  })

  it('skips lead when lead fire time is already in the past', () => {
    const notify = vi.fn()
    const scheduler = createScheduler({ notify })
    // leadTimeMs of 90s means lead would have fired 30s ago (deadline is 60s away)
    const timer: SyncTimerEntry = { ...BASE, leadTimeMs: 90_000 }

    scheduler.sync([timer])
    vi.advanceTimersByTime(60_000)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(timer, NotifyKind.Deadline)
  })
})

describe('deadline scheduling', () => {
  it('fires deadline notification when time reaches targetDatetime', () => {
    const notify = vi.fn()
    const scheduler = createScheduler({ notify })

    scheduler.sync([BASE])
    vi.advanceTimersByTime(60_000)

    expect(notify).toHaveBeenCalledWith(BASE, NotifyKind.Deadline)
  })

  it('skips deadline when targetDatetime is already in the past', () => {
    const notify = vi.fn()
    const scheduler = createScheduler({ notify })
    const pastTimer: SyncTimerEntry = { ...BASE, targetDatetime: new Date(NOW.getTime() - 1).toISOString() }

    scheduler.sync([pastTimer])
    vi.advanceTimersByTime(60_000)

    expect(notify).not.toHaveBeenCalled()
  })
})
