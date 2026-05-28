import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '../store/authStore'
import type { AuthState, AuthUser } from '../store/authStore'
export type { AuthState, AuthUser } from '../store/authStore'

export interface UseAuth {
  state: AuthState
  user: AuthUser | null
  login: () => void
  logout: () => Promise<void>
  continueAsGuest: () => void
}

export function useAuth(): UseAuth {
  return useAuthStore(
    useShallow((s) => ({
      state: s.state,
      user: s.user,
      login: s.login,
      logout: s.logout,
      continueAsGuest: s.continueAsGuest,
    })),
  )
}
