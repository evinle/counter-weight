import { describe, it, expect } from 'vitest'
import { nextRung } from './nudgeLadder.js'

const TARGET = new Date('2026-06-01T12:00:00Z')

describe('nextRung', () => {
  it('starts the ladder at +15 minutes when the deadline has just fired', () => {
    // Arrange
    const now = TARGET

    // Act
    const rung = nextRung(now, TARGET)

    // Assert
    expect(rung).toEqual({ index: 0, at: new Date('2026-06-01T12:15:00Z') })
  })

  it('picks the next rung after the one that just fired', () => {
    // Arrange
    const now = new Date('2026-06-01T12:20:00Z')

    // Act
    const rung = nextRung(now, TARGET)

    // Assert
    expect(rung).toEqual({ index: 1, at: new Date('2026-06-01T13:00:00Z') })
  })

  it('skips rungs that have already passed when invoked late', () => {
    // Arrange
    const now = new Date('2026-06-01T17:00:00Z')

    // Act
    const rung = nextRung(now, TARGET)

    // Assert
    expect(rung).toEqual({ index: 3, at: new Date('2026-06-02T12:00:00Z') })
  })

  it('moves past a rung when now lands exactly on its offset', () => {
    // Arrange
    const now = new Date('2026-06-01T12:15:00Z')

    // Act
    const rung = nextRung(now, TARGET)

    // Assert
    expect(rung).toEqual({ index: 1, at: new Date('2026-06-01T13:00:00Z') })
  })

  it('ends the chain once the final rung has been reached', () => {
    // Arrange
    const now = new Date('2026-06-08T12:00:00Z')

    // Act
    const rung = nextRung(now, TARGET)

    // Assert
    expect(rung).toBeNull()
  })
})
