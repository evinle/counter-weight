import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPushFanout } from './pushFanout.js'
import type { PushPayload, SendNotification } from './pushFanout.js'
import { createFakeNotifyDb } from '../test/fakes/notifyDb.js'
import type { FakeNotifyDb, FakePushSubscription } from '../test/fakes/notifyDb.js'
import { fromAny } from '@total-typescript/shoehorn'

const USER_ID = 'user-abc'
const PAYLOAD = { serverId: 'timer-1', title: 'Test timer', emoji: '⏰', kind: 'deadline' } satisfies PushPayload

const subscription1 = {
  id: 'sub-1',
  userId: USER_ID,
  endpoint: 'https://push.example.com/1',
  subscription: { p256dh: 'key1', auth: 'auth1', deviceHint: 'Chrome/macOS' },
} satisfies FakePushSubscription

const subscription2 = {
  id: 'sub-2',
  userId: USER_ID,
  endpoint: 'https://push.example.com/2',
  subscription: { p256dh: 'key2', auth: 'auth2', deviceHint: 'Safari/iPhone' },
} satisfies FakePushSubscription

let fakeDb: FakeNotifyDb
let sendNotification: ReturnType<typeof vi.fn> & SendNotification

beforeEach(() => {
  fakeDb = createFakeNotifyDb()
  sendNotification = fromAny(vi.fn().mockResolvedValue({ statusCode: 201 }))
})

describe('createPushFanout', () => {
  it('reports no attempts and sends nothing when the user has no subscriptions', async () => {
    // Arrange
    const push = createPushFanout(fakeDb, sendNotification)

    // Act
    const result = await push.send(USER_ID, PAYLOAD)

    // Assert
    expect(result).toEqual({ attempted: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends to every subscription of the user and reports how many it attempted', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1, subscription2] })
    const push = createPushFanout(fakeDb, sendNotification)

    // Act
    const result = await push.send(USER_ID, PAYLOAD)

    // Assert
    expect(result).toEqual({ attempted: 2 })
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('deletes a subscription when sendNotification rejects with statusCode 410', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1, subscription2] })
    const gone410 = Object.assign(new Error('Gone'), { statusCode: 410 })
    sendNotification = fromAny(vi.fn()
      .mockRejectedValueOnce(gone410)              // sub-1 → 410
      .mockResolvedValueOnce({ statusCode: 201 })) // sub-2 → ok
    const push = createPushFanout(fakeDb, sendNotification)

    // Act
    await push.send(USER_ID, PAYLOAD)

    // Assert: sub-1 removed, sub-2 kept
    expect(fakeDb.subscriptions.map((s) => s.id)).toEqual(['sub-2'])
  })

  it('keeps a subscription when sendNotification fails for a reason other than 410', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1] })
    sendNotification = fromAny(vi.fn().mockRejectedValue(new Error('boom')))
    const push = createPushFanout(fakeDb, sendNotification)

    // Act
    await push.send(USER_ID, PAYLOAD)

    // Assert
    expect(fakeDb.subscriptions).toHaveLength(1)
  })
})
