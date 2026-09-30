import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  ENTITY_COLORS,
  GROUP_COLORS,
  EntityColor,
  entityColorCss,
  entityColorLabel,
  entityColorVar,
  legacyHexToColor,
  normalizeEntityColor,
} from '../lib/entityColors'

// The preset hexes the old pickers stored, as an independent source of truth.
const OLD_PRESETS = [
  ['#ef4444', 'red'],
  ['#f97316', 'orange'],
  ['#eab308', 'yellow'],
  ['#22c55e', 'green'],
  ['#3b82f6', 'blue'],
  ['#8b5cf6', 'violet'],
  ['#ec4899', 'pink'],
  ['#6b7280', 'grey'],
] as const

describe('entity colour slots', () => {
  it('lists the eight slots in picker order', () => {
    expect(ENTITY_COLORS).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'pink', 'grey'])
  })

  it('offers groups every slot except grey', () => {
    expect(GROUP_COLORS).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'pink'])
  })

  it('names the CSS custom property for a slot', () => {
    expect(entityColorVar(EntityColor.Red)).toBe('var(--color-swatch-red)')
  })
})

describe('legacyHexToColor', () => {
  it.each(OLD_PRESETS)('maps the old preset %s to %s', (hex, slot) => {
    expect(legacyHexToColor(hex)).toBe(slot)
  })

  it('matches regardless of case', () => {
    expect(legacyHexToColor('#EF4444')).toBe('red')
  })

  it('returns undefined for a colour that was never a preset', () => {
    expect(legacyHexToColor('#123456')).toBeUndefined()
  })
})

describe('normalizeEntityColor', () => {
  it('keeps a slot name as it is', () => {
    expect(normalizeEntityColor('violet')).toBe('violet')
  })

  it('resolves an old preset hex to its slot', () => {
    expect(normalizeEntityColor('#22c55e')).toBe('green')
  })

  it.each([null, '', '#123456', 'chartreuse'])('has no slot for %j', (value) => {
    expect(normalizeEntityColor(value)).toBeNull()
  })
})

describe('theme tokens for entity colours', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const declared = [...css.matchAll(/--color-swatch-([a-z]+):/g)].map((m) => m[1])

  it('defines a --color-swatch token for every slot', () => {
    expect(declared).toEqual(expect.arrayContaining([...ENTITY_COLORS]))
  })

  it('declares no swatch token that has no slot', () => {
    expect([...ENTITY_COLORS].sort()).toEqual([...declared].sort())
  })
})

describe('entityColorCss', () => {
  it('uses the slot variable for a slot name', () => {
    expect(entityColorCss('red')).toBe('var(--color-swatch-red)')
  })

  it('uses the slot variable for an old preset hex still in the data', () => {
    expect(entityColorCss('#ef4444')).toBe('var(--color-swatch-red)')
  })

  it.each([null, '#123456'])('falls back to grey for %j', (stored) => {
    expect(entityColorCss(stored)).toBe('var(--color-swatch-grey)')
  })
})

describe('entityColorLabel', () => {
  it('capitalises the slot name', () => {
    expect(entityColorLabel(EntityColor.Violet)).toBe('Violet')
  })
})
