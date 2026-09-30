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

  it('completes a Task and closes its open work session when swiped', async () => {
    const running = {
      ...BASE_TIMER,
      timerType: TimerType.Task,
      workSessions: [{ startedAt: new Date(Date.now() - 60_000), endedAt: null }],
    }
    const id = await db.timers.add({ ...running, id: undefined })
    render(<TimerCard timer={{ ...running, id }} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 0, 250)

    await waitFor(async () => {
      const saved = await db.timers.get(id)
      expect(saved?.status).toBe('completed')
      expect(saved?.workSessions[0].endedAt).not.toBeNull()
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
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows a Drop button after a left swipe past half the reveal width', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument()

    dragCard(screen.getByTestId('timer-card'), 200, 60)

    expect(await screen.findByRole('button', { name: 'Drop' })).toBeInTheDocument()
  })

  it('reveals the drop panel while the card is still being dragged left', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.pointerDown(screen.getByTestId('timer-card'), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 0 })

    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument()
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 170, clientY: 0 })
  })

  it('makes the whole revealed red panel the drop button', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 60)

    const panel = await screen.findByTestId('drop-panel')
    fireEvent.click(panel)

    expect(panel.tagName).toBe('BUTTON')
    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
  })

  it('draws a bin icon in the drop button instead of a question mark', async () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 60)

    const button = await screen.findByRole('button', { name: 'Drop' })

    expect(button.querySelector('svg')).not.toBeNull()
    expect(button).not.toHaveTextContent('?')
  })

  it('keeps the drop button disabled while the card is still being dragged', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    fireEvent.pointerDown(screen.getByTestId('timer-card'), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 0 })

    expect(screen.getByTestId('drop-panel')).toBeDisabled()
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 0 })
  })

  it('enables the drop button once the card has stuck open', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 200, 60)

    expect(screen.getByTestId('drop-panel')).toBeEnabled()
  })

  it('does not arm when the left swipe stops short of 40% of the width', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    dragCard(screen.getByTestId('timer-card'), 200, 100)

    expect(screen.getByTestId('drop-panel')).toBeDisabled()
  })

  it('cancels the timer when the drop panel is tapped', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 60)

    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))

    await waitFor(async () => {
      expect((await db.timers.get(id))?.status).toBe('cancelled')
    })
  })

  it('disarms after 2 seconds of doing nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 60)
    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2000) })

    expect(screen.getByTestId('drop-panel')).toBeDisabled()
  })

  it('disarms when the card body is tapped', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    const card = screen.getByTestId('timer-card')
    dragCard(card, 200, 60)

    dragCard(card, 100, 100)

    expect(screen.getByTestId('drop-panel')).toBeDisabled()
  })

  it('closes without completing when an armed card is swiped right', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    const card = screen.getByTestId('timer-card')
    dragCard(card, 200, 60)

    dragCard(card, 0, 250)

    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.timers.get(id))?.status).toBe('active')
  })
})

describe('TimerCard — reveal panels', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, CARD_WIDTH, 100),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function startDrag(toX: number) {
    const card = screen.getByTestId('timer-card')
    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: toX, clientY: 0 })
    return card
  }

  it('shows only the drop panel while dragging left, never the complete panel', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    startDrag(190)

    expect(screen.getByTestId('drop-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('complete-panel')).not.toBeInTheDocument()
  })

  it('shows only the complete panel while dragging right, never the drop panel', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    startDrag(210)

    expect(screen.getByTestId('complete-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('drop-panel')).not.toBeInTheDocument()
  })

  it('shows no panel at all while the card is at rest', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.queryByTestId('complete-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('drop-panel')).not.toBeInTheDocument()
  })

  it('keeps the drop panel visible while a released card slides back, then removes it', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    const card = startDrag(190)
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 190, clientY: 0 })

    expect(screen.getByTestId('drop-panel')).toBeInTheDocument()

    fireEvent.transitionEnd(card, { propertyName: 'transform' })

    expect(screen.queryByTestId('drop-panel')).not.toBeInTheDocument()
  })

  it('keeps the drop panel visible while a disarmed card slides back, then removes it', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)
    const card = screen.getByTestId('timer-card')
    dragCard(card, 200, 60)

    dragCard(card, 100, 100)

    expect(screen.getByTestId('drop-panel')).toBeInTheDocument()
    fireEvent.transitionEnd(card, { propertyName: 'transform' })
    expect(screen.queryByTestId('drop-panel')).not.toBeInTheDocument()
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

  it('keeps showing a big bin after the drop panel is tapped and the timer is dropped', async () => {
    const id = await db.timers.add({ ...BASE_TIMER, id: undefined })
    render(<TimerCard timer={{ ...BASE_TIMER, id }} tagsMap={new Map()} onEdit={() => {}} />)
    dragCard(screen.getByTestId('timer-card'), 200, 60)

    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))

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
    expect(names.sort()).toEqual(['Complete', 'More actions'])
  })

  it('also shows a Start work button by default on a Task', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)

    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names.sort()).toEqual(['Complete', 'More actions', 'Start work'])
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

  it('tints the elapsed time with the accent colour while a session is running', () => {
    const running = { ...TASK, workSessions: [{ startedAt: new Date(), endedAt: null }] }
    render(<TimerCard timer={running} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('work-elapsed')).toHaveClass('text-accent')
  })

  it('mutes the elapsed time while no session is running', () => {
    render(<TimerCard timer={TASK} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('work-elapsed')).toHaveClass('text-ink-muted')
    expect(screen.getByTestId('work-elapsed')).not.toHaveClass('text-accent')
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

describe('TimerCard — theme colours', () => {
  it.each(['low', 'medium', 'high', 'critical'] as const)(
    'colours a %s priority label with its priority token',
    (priority) => {
      render(<TimerCard timer={{ ...BASE_TIMER, priority }} tagsMap={new Map()} onEdit={() => {}} />)

      expect(screen.getByTestId('priority-label')).toHaveClass(`text-priority-${priority}`)
    },
  )

  it('shows the countdown in the danger colour once the timer is overdue', () => {
    const overdue = { ...BASE_TIMER, targetDatetime: new Date(Date.now() - 60_000) }

    render(<TimerCard timer={overdue} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('countdown')).toHaveClass('text-danger')
  })

  it('shows the countdown in the normal ink colour while time remains', () => {
    render(<TimerCard timer={BASE_TIMER} tagsMap={new Map()} onEdit={() => {}} />)

    expect(screen.getByTestId('countdown')).toHaveClass('text-ink')
    expect(screen.getByTestId('countdown')).not.toHaveClass('text-danger')
  })
})

describe('TimerCard — tag colours', () => {
  const makeTag = (color: string | null) =>
    ({
      serverId: 'a', userId: null, name: 'Alpha', color, emoji: null, version: null,
      syncStatus: 'synced', createdAt: new Date(), updatedAt: new Date(),
    }) satisfies Tag

  it.each([
    ['a slot name', 'green', 'var(--color-swatch-green)'],
    ['an old preset hex', '#8b5cf6', 'var(--color-swatch-violet)'],
    ['no colour', null, 'var(--color-swatch-grey)'],
  ])('paints a tag chip from %s', (_label, color, expected) => {
    render(<TimerCard timer={{ ...BASE_TIMER, tagIds: ['a'] }} tagsMap={new Map([['a', makeTag(color)]])} onEdit={() => {}} />)

    expect(screen.getByText('Alpha').getAttribute('style')).toContain(expected)
  })

  it('uses the dark on-accent text colour on tag chips', () => {
    render(<TimerCard timer={{ ...BASE_TIMER, tagIds: ['a'] }} tagsMap={new Map([['a', makeTag('red')]])} onEdit={() => {}} />)

    expect(screen.getByText('Alpha')).toHaveClass('text-on-accent')
  })
})
