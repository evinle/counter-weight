import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { PullToRefreshProvider } from '../contexts/PullToRefreshContext'

function renderIndicator(syncing: boolean) {
  return render(
    <PullToRefreshProvider>
      <PullToRefreshIndicator syncing={syncing} />
    </PullToRefreshProvider>,
  )
}

describe('PullToRefreshIndicator', () => {
  it('shows a refreshing status while syncing', () => {
    renderIndicator(true)

    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
  })

  it('shows nothing when idle', () => {
    renderIndicator(false)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
