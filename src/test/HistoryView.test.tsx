import 'fake-indexeddb/auto'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HistoryView } from '../components/HistoryView'
import { PullToRefreshProvider } from '../contexts/PullToRefreshContext'
import { SyncTrigger } from '../lib/syncTrigger'

function renderHistory(onRefresh: (() => Promise<void>) | null, syncTrigger: SyncTrigger | null = null) {
  return render(
    <PullToRefreshProvider>
      <HistoryView onRefresh={onRefresh} syncTrigger={syncTrigger} />
    </PullToRefreshProvider>,
  )
}

describe('HistoryView refresh button', () => {
  it('refreshes when the button is clicked', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    renderHistory(onRefresh)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('has no refresh button when not refreshable', () => {
    renderHistory(null)

    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('shows the list-top spinner only for a manual refresh', () => {
    renderHistory(vi.fn().mockResolvedValue(undefined), SyncTrigger.PendingWrite)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
