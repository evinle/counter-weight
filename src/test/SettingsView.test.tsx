import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SettingsView } from '../components/SettingsView'
import { useAuthStore } from '../store/authStore'

const USER = { userId: 'user-1', email: 'a@b.co', firstName: 'A' }

describe('SettingsView actions', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_SHA__', 'abc1234')
    vi.stubGlobal('__BUILD_TIME__', '2026-01-01T00:00:00Z')
    useAuthStore.setState({ state: 'authenticated', user: USER })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['Export Timers', 'Import Timers', 'Logout'])(
    '%s has an svg icon and a plain-text label',
    (label) => {
      render(<SettingsView />)

      const button = screen.getByRole('button', { name: label })

      expect(button.querySelector('svg')).toBeInTheDocument()
      expect(button.textContent).toBe(label)
    },
  )

  it('has no Logout action for a guest', () => {
    useAuthStore.setState({ state: 'guest', user: null })

    render(<SettingsView />)

    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })
})
