import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { FeedView } from '../components/FeedView'
import { PullToRefreshProvider } from '../contexts/PullToRefreshContext'
import { completeTimer } from '../hooks/useTimers'
import { TimerType } from '../db/schema'
import type { Timer } from '../db/schema'

const CARD_WIDTH = 300

const BASE_TIMER = {
  title: 'Pizza',
  description: null,
  emoji: null,
  targetDatetime: new Date(Date.now() + 3_600_000),
  originalTargetDatetime: new Date(Date.now() + 3_600_000),
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
} satisfies Omit<Timer, 'id'>

function renderFeed() {
  return render(
    <PullToRefreshProvider>
      <FeedView onEdit={() => {}} onManageGroups={() => {}} userId={null} onRefresh={null} syncing={false} />
    </PullToRefreshProvider>,
  )
}

function dragCard(card: HTMLElement, fromX: number, toX: number) {
  const init = { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 0 }
  fireEvent.pointerDown(card, { ...init, clientX: fromX })
  fireEvent.pointerMove(window, { ...init, clientX: toX })
  fireEvent.pointerUp(window, { ...init, clientX: toX })
}

function pause(ms: number) {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
}

describe('FeedView — departing cards', () => {
  beforeEach(async () => {
    await db.timers.clear()
    HTMLElement.prototype.scrollIntoView = () => {}
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, CARD_WIDTH, 100),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a swiped-complete card on screen after its timer leaves the active feed', async () => {
    const id = await db.timers.add({ ...BASE_TIMER })
    renderFeed()
    await screen.findByText('Pizza')

    dragCard(screen.getByTestId('timer-card'), 0, 250)
    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('completed')
    })
    await pause(100)

    expect(screen.getByText('Pizza')).toBeInTheDocument()
  })

  it('keeps a dropped card on screen after its timer leaves the active feed', async () => {
    const id = await db.timers.add({ ...BASE_TIMER })
    renderFeed()
    await screen.findByText('Pizza')
    dragCard(screen.getByTestId('timer-card'), 200, 140)

    fireEvent.click(await screen.findByRole('button', { name: 'Drop?' }))
    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
    await pause(100)

    expect(screen.getByText('Pizza')).toBeInTheDocument()
  })

  it('removes the departed card about a second later', async () => {
    await db.timers.add({ ...BASE_TIMER })
    renderFeed()
    await screen.findByText('Pizza')

    dragCard(screen.getByTestId('timer-card'), 0, 250)

    await waitFor(() => expect(screen.queryByText('Pizza')).not.toBeInTheDocument(), { timeout: 3000 })
  })

  it('removes a timer immediately when it leaves the feed without a swipe', async () => {
    const id = await db.timers.add({ ...BASE_TIMER })
    renderFeed()
    await screen.findByText('Pizza')

    if (id === undefined) throw new Error('timer was not created')
    await completeTimer(id)
    await pause(100)

    expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
  })
})
