import { describe, it, expect } from 'vitest'
import { parseSchedulePayload } from './events.js'
import type { SchedulePayload } from '../api/scheduler.js'

const SERVER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-abc'

describe('parseSchedulePayload', () => {
  it('maps a legacy lead payload to a lead event firing at leadAt', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      targetDatetime: '2026-06-01T11:00:00Z',
      kind: 'lead',
    } satisfies SchedulePayload

    // Act
    const event = parseSchedulePayload(wire)

    // Assert
    expect(event).toEqual({
      kind: 'lead',
      serverId: SERVER_ID,
      userId: USER_ID,
      leadAt: new Date('2026-06-01T11:00:00Z'),
    })
  })

  it('maps a legacy deadline payload to a deadline event firing at the deadline', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      targetDatetime: '2026-06-01T12:00:00Z',
      kind: 'deadline',
    } satisfies SchedulePayload

    // Act
    const event = parseSchedulePayload(wire)

    // Assert
    expect(event).toEqual({
      kind: 'deadline',
      serverId: SERVER_ID,
      userId: USER_ID,
      deadline: new Date('2026-06-01T12:00:00Z'),
    })
  })

  it('maps an overdue payload to an overdue event with its own nudge time and deadline', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      kind: 'overdue',
      nudgeAt: '2026-06-01T12:15:00Z',
      deadline: '2026-06-01T12:00:00Z',
    } satisfies SchedulePayload

    // Act
    const event = parseSchedulePayload(wire)

    // Assert
    expect(event).toEqual({
      kind: 'overdue',
      serverId: SERVER_ID,
      userId: USER_ID,
      nudgeAt: new Date('2026-06-01T12:15:00Z'),
      deadline: new Date('2026-06-01T12:00:00Z'),
    })
  })

  it('rejects a payload whose targetDatetime is not a valid date, naming the field', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      targetDatetime: 'not-a-date',
      kind: 'deadline',
    } satisfies SchedulePayload

    // Act
    const parse = () => parseSchedulePayload(wire)

    // Assert
    expect(parse).toThrow(/targetDatetime/)
  })

  it('rejects an overdue payload whose deadline is not a valid date, naming the field', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      kind: 'overdue',
      nudgeAt: '2026-06-01T12:15:00Z',
      deadline: 'not-a-date',
    } satisfies SchedulePayload

    // Act
    const parse = () => parseSchedulePayload(wire)

    // Assert
    expect(parse).toThrow(/deadline/)
  })

  it('treats a payload with no kind as a deadline (schedules created before kind existed)', () => {
    // Arrange
    const wire = {
      serverId: SERVER_ID,
      userId: USER_ID,
      targetDatetime: '2026-06-01T12:00:00Z',
    } satisfies SchedulePayload

    // Act
    const event = parseSchedulePayload(wire)

    // Assert
    expect(event).toEqual({
      kind: 'deadline',
      serverId: SERVER_ID,
      userId: USER_ID,
      deadline: new Date('2026-06-01T12:00:00Z'),
    })
  })
})
