import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { PullToRefreshProvider, usePullDistance } from '../contexts/PullToRefreshContext'
import { SyncTrigger } from '../lib/syncTrigger'

function PullDistanceSetter({ distance }: { distance: number }) {
  const { setPullDistance } = usePullDistance()
  useEffect(() => setPullDistance(distance), [distance, setPullDistance])
  return null
}

function renderIndicator(syncTrigger: SyncTrigger | null) {
  return render(
    <PullToRefreshProvider>
      <PullToRefreshIndicator syncTrigger={syncTrigger} />
    </PullToRefreshProvider>,
  )
}

describe('PullToRefreshIndicator', () => {
  it('shows a refreshing status while a manual refresh is running', () => {
    renderIndicator(SyncTrigger.Manual)

    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
  })

  it('shows a pull arrow as an svg icon while pulling', () => {
    const { container } = render(
      <PullToRefreshProvider>
        <PullDistanceSetter distance={40} />
        <PullToRefreshIndicator syncTrigger={null} />
      </PullToRefreshProvider>,
    )

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.textContent).toBe('')
  })

  it('shows nothing when idle', () => {
    renderIndicator(null)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([SyncTrigger.PendingWrite, SyncTrigger.Login, SyncTrigger.Online, SyncTrigger.Visible])(
    'stays hidden for a background %s sync',
    (trigger) => {
      renderIndicator(trigger)

      expect(screen.queryByRole('status')).toBeNull()
    },
  )
})
