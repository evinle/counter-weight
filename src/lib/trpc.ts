import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/api/index'

export let idToken: string | null = null

export function setIdToken(token: string | null) {
  idToken = token
}

// Module-level singleton: if 10 tRPC calls all 401 simultaneously, they share
// one refresh request instead of triggering 10 concurrent Cognito calls
// (which would each get a rotated refresh token, invalidating all but the last).
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshRes = await fetch('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
  if (!refreshRes.ok) { setIdToken(null); return null }
  const { idToken: newToken } = (await refreshRes.json()) as { idToken: string }
  setIdToken(newToken)
  return newToken
}

async function refreshAndRetry(url: RequestInfo, options: RequestInit): Promise<Response> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  const newToken = await refreshPromise
  if (!newToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${newToken}`)
  return fetch(url, { ...options, headers })
}

async function fetchWithAuth(url: RequestInfo, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, options)
  if (res.status === 401 && idToken) return refreshAndRetry(url, options)
  return res
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      fetch: fetchWithAuth,
      headers() {
        return idToken ? { Authorization: `Bearer ${idToken}` } : {}
      },
    }),
  ],
})
