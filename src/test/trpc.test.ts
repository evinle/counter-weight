import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
  API_URL: 'https://test.example.com',
  fetchFromBackend: vi.fn(),
}))

import { trpcReact, trpcReactClient } from '../lib/trpc.js'

describe('trpcReact', () => {
  it('is exported from the tRPC client module', () => {
    expect(trpcReact).toBeDefined()
  })

  it('has a useUtils method indicating createTRPCReact was called correctly', () => {
    expect(typeof trpcReact.useUtils).toBe('function')
  })
})

describe('trpcReactClient', () => {
  it('is exported from the tRPC client module', () => {
    expect(trpcReactClient).toBeDefined()
  })
})
