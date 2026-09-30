import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { PullToRefreshProvider } from '../contexts/PullToRefreshContext'
import { MIN_REFRESH_INDICATOR_MS } from '../lib/gestures'

function renderIndicator(syncing: boolean) {
  const ui = (s: boolean) => (
    <PullToRefreshProvider>
      <PullToRefreshIndicator syncing={s} />
    </PullToRefreshProvider>
  )
  const view = render(ui(syncing))
  return { setSyncing: (s: boolean) => view.rerender(ui(s)) }
}

describe('PullToRefreshIndicator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a refreshing status while syncing', () => {
    renderIndicator(true)

    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
  })

  it('shows nothing when idle', () => {
    renderIndicator(false)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays visible for the minimum time after a fast sync finishes', () => {
    vi.useFakeTimers()
    const { setSyncing } = renderIndicator(true)

    setSyncing(false)

    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
  })

  it('disappears once the minimum time has passed', () => {
    vi.useFakeTimers()
    const { setSyncing } = renderIndicator(true)
    setSyncing(false)

    act(() => { vi.advanceTimersByTime(MIN_REFRESH_INDICATOR_MS) })

    expect(screen.queryByRole('status')).toBeNull()
  })
})
