import 'fake-indexeddb/auto'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HistoryView } from '../components/HistoryView'
import { PullToRefreshProvider } from '../contexts/PullToRefreshContext'

function renderHistory(onRefresh: (() => Promise<void>) | null) {
  return render(
    <PullToRefreshProvider>
      <HistoryView onRefresh={onRefresh} syncing={false} />
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
})
