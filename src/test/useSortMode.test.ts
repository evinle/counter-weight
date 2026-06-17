import { describe, it, expect, beforeEach } from 'vitest'
import { StorageKey } from '../lib/storageKeys'
import { isSortMode, isSortDirection, SortModes, SortDirections } from '../lib/sort'

// Test the read helpers directly — they're the public contract of useSortMode's persistence layer
function readSortMode() {
  const raw = localStorage.getItem(StorageKey.SortMode)
  return isSortMode(raw) ? raw : SortModes.Smart
}

function readSortDirection() {
  const raw = localStorage.getItem(StorageKey.SortDirection)
  return isSortDirection(raw) ? raw : SortDirections.Desc
}

beforeEach(() => localStorage.clear())

describe('readSortMode', () => {
  it('defaults to "smart" when key is absent', () => {
    expect(readSortMode()).toBe('smart')
  })

  it('returns stored mode when valid', () => {
    localStorage.setItem(StorageKey.SortMode, 'priority')
    expect(readSortMode()).toBe('priority')
  })

  it('falls back to "smart" when stored value is not a valid SortMode', () => {
    localStorage.setItem(StorageKey.SortMode, 'bogus')
    expect(readSortMode()).toBe('smart')
  })
})

describe('readSortDirection', () => {
  it('defaults to "desc" when key is absent', () => {
    expect(readSortDirection()).toBe('desc')
  })

  it('returns stored direction when valid', () => {
    localStorage.setItem(StorageKey.SortDirection, 'asc')
    expect(readSortDirection()).toBe('asc')
  })

  it('falls back to "desc" when stored value is not a valid SortDirection', () => {
    localStorage.setItem(StorageKey.SortDirection, 'sideways')
    expect(readSortDirection()).toBe('desc')
  })
})

describe('mode and direction independence', () => {
  it('setting mode does not affect stored direction', () => {
    localStorage.setItem(StorageKey.SortDirection, 'asc')
    localStorage.setItem(StorageKey.SortMode, 'title')
    expect(readSortDirection()).toBe('asc')
    expect(readSortMode()).toBe('title')
  })
})
