import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { App } from '../App'
import { useAuthStore } from '../store/authStore'
import type { AuthState } from '../store/authStore'

// Sync talks to the network via tRPC; irrelevant to layout.
vi.mock('../hooks/useSyncEngine', () => ({
  useSyncEngine: () => ({ trigger: null, triggerSync: async () => {} }),
}))

function setAuthState(state: AuthState) {
  useAuthStore.setState({ state, user: null, bootstrap: async () => {} })
}

describe('App bottom padding', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = () => {}
    setAuthState('guest')
  })

  it('reserves tab-bar space on a tab view where the tab bar is shown', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: 'Tab navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('pb-tab-bar')
  })

  it('reserves only the safe-area inset on the create screen, where no tab bar is shown', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Create new timer' }))

    expect(screen.queryByRole('navigation', { name: 'Tab navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('pb-safe-bottom')
    expect(screen.getByRole('main')).not.toHaveClass('pb-tab-bar')
  })

  it('reserves only the safe-area inset when logged out, where no tab bar is shown', () => {
    setAuthState('unauthenticated')

    render(<App />)

    expect(screen.queryByRole('navigation', { name: 'Tab navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('pb-safe-bottom')
    expect(screen.getByRole('main')).not.toHaveClass('pb-tab-bar')
  })
})
