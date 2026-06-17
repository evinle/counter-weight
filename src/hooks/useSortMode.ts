import { useState } from 'react'
import { StorageKey } from '../lib/storageKeys'
import { SortModes, SortDirections, isSortMode, isSortDirection } from '../lib/sort'
import type { SortMode, SortDirection } from '../lib/sort'

function readSortMode(): SortMode {
  const raw = localStorage.getItem(StorageKey.SortMode)
  return isSortMode(raw) ? raw : SortModes.Smart
}

function readSortDirection(): SortDirection {
  const raw = localStorage.getItem(StorageKey.SortDirection)
  return isSortDirection(raw) ? raw : SortDirections.Desc
}

export function useSortMode() {
  const [mode, setModeState] = useState<SortMode>(readSortMode)
  const [direction, setDirectionState] = useState<SortDirection>(readSortDirection)

  function setMode(next: SortMode) {
    localStorage.setItem(StorageKey.SortMode, next)
    setModeState(next)
  }

  function setDirection(next: SortDirection) {
    localStorage.setItem(StorageKey.SortDirection, next)
    setDirectionState(next)
  }

  return { mode, setMode, direction, setDirection }
}
