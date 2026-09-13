import { describe, it, expect } from 'vitest'
import { findGestureOwner } from '../lib/gestureScope'

function makeScrollableX() {
  const el = document.createElement('div')
  el.style.overflowX = 'auto'
  Object.defineProperty(el, 'scrollWidth', { value: 500, writable: true })
  Object.defineProperty(el, 'clientWidth', { value: 200, writable: true })
  return el
}

describe('findGestureOwner', () => {
  it('returns the nearest ancestor that natively scrolls on the given axis', () => {
    const boundary = document.createElement('div')
    const picker = makeScrollableX()
    const emoji = document.createElement('span')
    picker.appendChild(emoji)
    boundary.appendChild(picker)

    expect(findGestureOwner(emoji, 'x', boundary)).toBe(picker)
  })

  it('returns the nearest ancestor carrying a matching data-gesture-owner marker, even without native scroll', () => {
    const boundary = document.createElement('div')
    const card = document.createElement('div')
    card.dataset.gestureOwner = 'x'
    const child = document.createElement('span')
    card.appendChild(child)
    boundary.appendChild(card)

    expect(findGestureOwner(child, 'x', boundary)).toBe(card)
  })

  it('pins to the innermost matching ancestor when an outer one also claims the axis', () => {
    const boundary = document.createElement('div')
    const outer = makeScrollableX()
    const inner = document.createElement('div')
    inner.dataset.gestureOwner = 'x'
    const child = document.createElement('span')
    inner.appendChild(child)
    outer.appendChild(inner)
    boundary.appendChild(outer)

    expect(findGestureOwner(child, 'x', boundary)).toBe(inner)
  })

  it('returns null when no ancestor claims the axis before the boundary', () => {
    const boundary = document.createElement('div')
    const plain = document.createElement('span')
    boundary.appendChild(plain)

    expect(findGestureOwner(plain, 'x', boundary)).toBeNull()
  })
})
