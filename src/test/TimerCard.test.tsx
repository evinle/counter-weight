import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { TimerCard } from '../components/TimerCard'
import { TimerType } from '../db/schema'
import type { Tag, Timer } from '../db/schema'

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

const CARD_WIDTH = 300

function dragCard(
  card: HTMLElement,
  fromX: number,
  toX: number,
  { pointerType = 'mouse', toY = 0 }: { pointerType?: 'mouse' | 'touch'; toY?: number } = {},
) {
  fireEvent.pointerDown(card, { pointerId: 1, pointerType, button: 0, clientX: fromX, clientY: 0 })
  fireEvent.pointerMove(window, { pointerId: 1, pointerType, clientX: toX, clientY: toY })
  fireEvent.pointerUp(window, { pointerId: 1, pointerType, clientX: toX, clientY: toY })
}

describe('TimerCard — swipe right to complete', () => {
  beforeEach(async () => {
    await db.timers.clear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, CARD_WIDTH, 100),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('completes the timer when a mouse drag passes 70% of the card width', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 0, 250)

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('completed')
    })
  })

  it('completes the timer on a touch drag too', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 0, 250, { pointerType: 'touch' })

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('completed')
    })
  })

  it('does not complete the timer when the drag stops short of 70% of the width', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 0, 200)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.timers.get(id))?.status).toBe('active')
  })

  it('does not complete the timer when the drag is mostly vertical', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 0, 250, { toY: 400 })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.timers.get(id))?.status).toBe('active')
  })
})

describe('TimerCard — swipe left to drop', () => {
  beforeEach(async () => {
    await db.timers.clear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, CARD_WIDTH, 100),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a Drop? button after a left swipe past half the reveal width', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Drop?' })).not.toBeInTheDocument()

    dragCard(screen.getByTestId('timer-card'), 200, 140)

    expect(await screen.findByRole('button', { name: 'Drop?' })).toBeInTheDocument()
  })

  it('reveals the Drop? panel while the card is still being dragged left', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.pointerDown(screen.getByTestId('timer-card'), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 0 })

    expect(screen.getByRole('button', { name: 'Drop?' })).toBeInTheDocument()
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 0 })
  })

  it('does not arm when the left swipe stops short of half the reveal width', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 200, 170)

    expect(screen.queryByRole('button', { name: 'Drop?' })).not.toBeInTheDocument()
  })

  it('cancels the timer when Drop? is tapped', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 140)

    fireEvent.click(await screen.findByRole('button', { name: 'Drop?' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
  })

  it('disarms after 2 seconds of doing nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 140)
    expect(screen.getByRole('button', { name: 'Drop?' })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2000) })

    expect(screen.queryByRole('button', { name: 'Drop?' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('disarms when the card body is tapped', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    const card = screen.getByTestId('timer-card')
    dragCard(card, 200, 140)

    dragCard(card, 100, 100)

    expect(screen.queryByRole('button', { name: 'Drop?' })).not.toBeInTheDocument()
  })

  it('closes without completing when an armed card is swiped right', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    const card = screen.getByTestId('timer-card')
    dragCard(card, 200, 140)

    dragCard(card, 0, 250)

    expect(screen.queryByRole('button', { name: 'Drop?' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.timers.get(id))?.status).toBe('active')
  })
})

describe('TimerCard — drop confirmation', () => {
  beforeEach(async () => {
    await db.timers.clear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, CARD_WIDTH, 100),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps showing a big bin after Drop? is tapped and the timer is dropped', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 140)

    fireEvent.click(await screen.findByRole('button', { name: 'Drop?' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
    expect(screen.getByTestId('drop-confirmation')).toBeInTheDocument()
  })
})

describe('TimerCard — complete button', () => {
  it('completes the timer immediately and shows the confirmation when tapped', async () => {
    await db.timers.clear()
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('completed')
    })
    expect(screen.getByTestId('complete-confirmation')).toBeInTheDocument()
  })
})

describe('TimerCard — actions menu', () => {
  const OVERDUE = { ...BASE_TIMER, targetDatetime: new Date(Date.now() - 60_000) }
  const TASK = { ...BASE_TIMER, timerType: TimerType.Task }

  function openMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  }

  beforeEach(async () => {
    await db.timers.clear()
  })

  it('shows only the complete and more-actions buttons by default on a Reminder', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['More actions', 'Complete'])
  })

  it('also shows a Start work button by default on a Task', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)

    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['More actions', 'Start work', 'Complete'])
  })

  it('reveals Edit and Drop when the menu is opened', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    openMenu()

    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Edit', 'Drop'])
  })

  it('calls onEdit with the timer and closes the menu when Edit is chosen', () => {
    const edited: Timer[] = []
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={(t) => edited.push(t)} />)
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(edited).toEqual([BASE_TIMER])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('drops the timer and shows the confirmation when Drop is chosen', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Drop' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
    expect(screen.getByTestId('drop-confirmation')).toBeInTheDocument()
  })

  it('omits Edit from the menu once the timer is overdue', () => {
    render(<TimerCard timer={OVERDUE} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Drop'])
  })

  it('keeps work controls out of the menu on a Task', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Edit', 'Drop'])
  })

  it('starts every menu item with an icon', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    const leading = screen.getAllByRole('menuitem').map((item) => item.firstElementChild?.tagName.toLowerCase())
    expect(leading).toEqual(['svg', 'svg'])
  })

  it('closes when Escape is pressed', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when the user presses outside the menu', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    openMenu()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('TimerCard — work timer row', () => {
  const TASK = { ...BASE_TIMER, timerType: TimerType.Task }

  beforeEach(async () => {
    await db.timers.clear()
  })

  it('reserves a work timer row on a Task before any session has started', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('work-row')).toBeInTheDocument()
  })

  it('has no work timer row on a Reminder', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.queryByTestId('work-row')).not.toBeInTheDocument()
  })

  it('puts the play/pause button inside the work timer row', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)

    expect(within(screen.getByTestId('work-row')).getByRole('button', { name: 'Start work' })).toBeInTheDocument()
  })

  it('shows Pause work while a session is open', () => {
    const running = { ...TASK, workSessions: [{ startedAt: new Date(), endedAt: null }] }
    render(<TimerCard timer={running} tagsMap={new Map()} onEdit={() => {}} />)

    expect(within(screen.getByTestId('work-row')).getByRole('button', { name: 'Pause work' })).toBeInTheDocument()
  })

  it('starts a work session when Start work is tapped', async () => {
    const id = await db.timers.add({ ...TASK, id: undefined })
    render(<TimerCard timer={{ ...TASK, id }} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start work' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.workSessions).toHaveLength(1)
    })
  })

  it('closes the open session when Pause work is tapped', async () => {
    const running = { ...TASK, workSessions: [{ startedAt: new Date(), endedAt: null }] }
    const id = await db.timers.add({ ...running, id: undefined })
    render(<TimerCard timer={{ ...running, id }} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause work' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.workSessions[0].endedAt).not.toBeNull()
    })
  })
})

describe('TimerCard — layout', () => {
  it('has no permanent swipe hints on the card', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.queryByTestId('complete-hint')).not.toBeInTheDocument()
    expect(screen.queryByTestId('drop-hint')).not.toBeInTheDocument()
  })

  it('keeps a tag row even when the timer has no tags', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('timer-tags')).toBeInTheDocument()
  })

  it('shows every tag when there are several', () => {
    const makeTag = (serverId: string, name: string) =>
      ({
        serverId,
        userId: null,
        name,
        color: '#444444',
        emoji: null,
        version: null,
        syncStatus: 'synced',
        createdAt: new Date(),
        updatedAt: new Date(),
      }) satisfies Tag
    const tagsMap = new Map<string, Tag>([
      ['a', makeTag('a', 'Alpha')],
      ['b', makeTag('b', 'A really quite long tag name indeed')],
      ['c', makeTag('c', 'Gamma')],
    ])
    render(<TimerCard timer={{ ...BASE_TIMER, tagIds: ['a', 'b', 'c'] }} tagsMap={tagsMap} onEdit={() => {}} />)

    expect(within(screen.getByTestId('timer-tags')).getAllByText(/Alpha|long tag|Gamma/)).toHaveLength(3)
  })
})
