import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PullToRefreshProvider, usePullDistance } from '../contexts/PullToRefreshContext'

describe('PullToRefreshContext', () => {
  it('shares pullDistance set by one consumer with another consumer under the same provider', () => {
    const { result } = renderHook(() => usePullDistance(), {
      wrapper: PullToRefreshProvider,
    })

    act(() => { result.current.setPullDistance(42) })

    expect(result.current.pullDistance).toBe(42)
  })
})
