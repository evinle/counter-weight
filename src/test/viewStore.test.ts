import { describe, it, expect, beforeEach } from 'vitest'
import { useViewStore } from '../store/viewStore'

describe('viewStore', () => {
  beforeEach(() => {
    useViewStore.setState({ selectedGroupId: null })
  })

  it('starts with no selected group', () => {
    expect(useViewStore.getState().selectedGroupId).toBeNull()
  })

  it('setSelectedGroup updates the selected group', () => {
    useViewStore.getState().setSelectedGroup(3)

    expect(useViewStore.getState().selectedGroupId).toBe(3)
  })

  it('clearSelectedGroup resets to null', () => {
    useViewStore.getState().setSelectedGroup(3)
    useViewStore.getState().clearSelectedGroup()

    expect(useViewStore.getState().selectedGroupId).toBeNull()
  })
})
