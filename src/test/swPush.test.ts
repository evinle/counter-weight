import { describe, it, expect } from 'vitest'
import { shouldSuppressPush } from '../lib/swPushDedup.js'

describe('shouldSuppressPush', () => {
  it('suppresses when serverId is in the fired set', () => {
    const fired = new Set(['timer-abc'])
    expect(shouldSuppressPush('timer-abc', fired, false)).toBe(true)
  })

  it('suppresses when a visible client exists', () => {
    const fired = new Set<string>()
    expect(shouldSuppressPush('timer-xyz', fired, true)).toBe(true)
  })

  it('does not suppress when serverId is not fired and no visible client', () => {
    const fired = new Set<string>()
    expect(shouldSuppressPush('timer-xyz', fired, false)).toBe(false)
  })

  it('suppresses when both conditions are true', () => {
    const fired = new Set(['timer-abc'])
    expect(shouldSuppressPush('timer-abc', fired, true)).toBe(true)
  })
})
