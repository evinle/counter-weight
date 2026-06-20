import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TimerCard } from '../components/TimerCard'
import { TimerType } from '../db/schema'
import type { Timer } from '../db/schema'

const BASE_TIMER: Timer = {
  id: 1,
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date(Date.now() + 60_000),
  originalTargetDatetime: new Date(Date.now() + 60_000),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  tagIds: [],
  timerType: TimerType.Reminder,
  leadTimeMs: null,
  workSessions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  serverId: null,
  userId: null,
  syncStatus: 'synced',
  version: null,
}

describe('TimerCard — recurring indicator', () => {
  it('shows no recurring indicator when recurrenceRule is null', () => {
    render(
      <TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />,
    )

    expect(screen.queryByTestId('recurring-indicator')).not.toBeInTheDocument()
  })

  it('shows a recurring indicator when recurrenceRule is set', () => {
    const timer = { ...BASE_TIMER, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } }

    render(
      <TimerCard timer={timer} tagsMap={new Map()} onEdit={() => {}} />,
    )

    expect(screen.getByTestId('recurring-indicator')).toBeInTheDocument()
  })
})
