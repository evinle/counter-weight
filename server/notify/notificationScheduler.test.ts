import { describe, it, expect } from 'vitest'
import { createNotificationScheduler } from './notificationScheduler.js'
import { createFakeScheduler } from '../test/fakes/scheduler.js'
import type { OverdueEvent } from './events.js'

const SERVER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-abc'
const NOW = new Date('2026-06-01T12:00:00Z')

const overdueEvent = {
  kind: 'overdue',
  serverId: SERVER_ID,
  userId: USER_ID,
  nudgeAt: new Date('2026-06-01T12:15:00Z'),
  deadline: new Date('2026-06-01T12:00:00Z'),
} satisfies OverdueEvent

describe('createNotificationScheduler', () => {
  it('puts an overdue nudge on the schedule, named for the timer and its fire time', async () => {
    // Arrange
    const scheduler = createFakeScheduler()
    const notifications = createNotificationScheduler(scheduler, () => NOW)

    // Act
    await notifications.schedule(overdueEvent)

    // Assert
    expect([...scheduler.schedules.values()]).toEqual([
      {
        name: `timer-overdue-${SERVER_ID}-1780316100`,
        targetDatetime: new Date('2026-06-01T12:15:00Z'),
        payload: {
          serverId: SERVER_ID,
          userId: USER_ID,
          kind: 'overdue',
          nudgeAt: '2026-06-01T12:15:00.000Z',
          deadline: '2026-06-01T12:00:00.000Z',
        },
      },
    ])
  })
})
