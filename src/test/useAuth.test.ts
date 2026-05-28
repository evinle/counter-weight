import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'

const initialState = {
  state: 'loading' as const,
  user: null,
  lastUser: null,
  bootstrapStarted: false,
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState)
})

describe('useAuth', () => {
  it('exposes state, user, login, logout, continueAsGuest', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.state).toBe('loading')
    expect(result.current.user).toBeNull()
    expect(typeof result.current.login).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.continueAsGuest).toBe('function')
  })

  it('reflects store state changes', () => {
    const { result, rerender } = renderHook(() => useAuth())
    useAuthStore.getState().setUnauthenticated()
    rerender()
    expect(result.current.state).toBe('unauthenticated')
  })
})
