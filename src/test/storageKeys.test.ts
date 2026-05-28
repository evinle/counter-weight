import { describe, it, expect, beforeEach } from 'vitest'
import { isLastUser, readLastUser, StorageKey } from '../lib/storageKeys'

beforeEach(() => localStorage.clear())

describe('isLastUser', () => {
  it('returns true for a valid LastUser object', () => {
    expect(isLastUser({ userId: 'u1', firstName: 'Alice' })).toBe(true)
  })

  it('returns false when userId is missing', () => {
    expect(isLastUser({ firstName: 'Alice' })).toBe(false)
  })

  it('returns false when firstName is not a string', () => {
    expect(isLastUser({ userId: 'u1', firstName: 42 })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isLastUser(null)).toBe(false)
  })
})

describe('readLastUser', () => {
  it('returns null when localStorage has no entry', () => {
    expect(readLastUser()).toBeNull()
  })

  it('returns parsed LastUser when entry is valid', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    expect(readLastUser()).toEqual({ userId: 'u1', firstName: 'Alice' })
  })

  it('returns null when JSON is malformed', () => {
    localStorage.setItem(StorageKey.LastUser, 'not-json')
    expect(readLastUser()).toBeNull()
  })

  it('returns null when stored object fails isLastUser', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1' }))
    expect(readLastUser()).toBeNull()
  })
})
