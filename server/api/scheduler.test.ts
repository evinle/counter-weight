import { describe, it, expect, vi } from 'vitest'
import { SchedulerClient, ResourceNotFoundException } from '@aws-sdk/client-scheduler'
import { AwsScheduler } from './scheduler.js'

function makeScheduler() {
  const send = vi.fn()
  const client = { send } as unknown as SchedulerClient
  return { scheduler: new AwsScheduler(client, 'arn:aws:lambda:::function:notify', 'arn:aws:iam:::role/scheduler'), send }
}

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
