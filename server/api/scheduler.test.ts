import { describe, it, expect, vi } from 'vitest'
import { SchedulerClient, ResourceNotFoundException } from '@aws-sdk/client-scheduler'
import { fromPartial } from '@total-typescript/shoehorn'
import { AwsScheduler, timerScheduleKeys, isScheduleKey } from './scheduler.js'

const TIMER_ID = '00000000-0000-0000-0000-000000000001'
const KEYS = timerScheduleKeys(TIMER_ID)

describe('timerScheduleKeys', () => {
  it('returns distinct strings for deadline, lead, and bare serverId', () => {
    const distinct = new Set([KEYS.deadline, KEYS.lead, TIMER_ID])
    expect(distinct.size).toBe(3)
  })
})

describe('isScheduleKey', () => {
  it('returns true for a valid deadline key', () => {
    expect(isScheduleKey(KEYS.deadline)).toBe(true)
  })

  it('returns true for a valid lead key', () => {
    expect(isScheduleKey(KEYS.lead)).toBe(true)
  })

  it('returns false for a bare serverId', () => {
    expect(isScheduleKey(TIMER_ID)).toBe(false)
  })

  it('returns false for a string with the wrong prefix', () => {
    expect(isScheduleKey('schedule-not-a-uuid')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isScheduleKey('')).toBe(false)
  })
})

function makeScheduler() {
  const send = vi.fn()
  const client = fromPartial<SchedulerClient>({ send })
  return { scheduler: new AwsScheduler(client, 'arn:aws:lambda:::function:notify', 'arn:aws:iam:::role/scheduler'), send }
}

describe('AwsScheduler.updateSchedule', () => {
  it('falls back to create when the schedule does not exist', async () => {
    const { scheduler, send } = makeScheduler()
    send
      .mockRejectedValueOnce(new ResourceNotFoundException({ message: 'Not found', Message: 'Not found', $metadata: {} }))
      .mockResolvedValueOnce({})

    await expect(
      scheduler.updateSchedule('timer-123', new Date(), { serverId: 'srv-1', userId: 'u1', targetDatetime: '2026-06-01T12:00:00Z' }),
    ).resolves.toBeUndefined()

    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('AwsScheduler.deleteSchedule', () => {
  it('resolves silently when the schedule is already gone', async () => {
    const { scheduler, send } = makeScheduler()
    send.mockRejectedValue(new ResourceNotFoundException({ message: 'Not found', Message: 'Not found', $metadata: {} }))

    await expect(scheduler.deleteSchedule('timer-123')).resolves.toBeUndefined()
  })

  it('re-throws errors that are not ResourceNotFoundException', async () => {
    const { scheduler, send } = makeScheduler()
    send.mockRejectedValue(new Error('Network failure'))

    await expect(scheduler.deleteSchedule('timer-123')).rejects.toThrow('Network failure')
  })
})
