import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Tailwind palette utilities like `bg-slate-800`, `text-white`, `hover:bg-blue-500/20`.
// Components must use the theme tokens from index.css (`bg-surface`, `text-ink`, …) instead.
const PALETTE_CLASS =
  /\b(?:bg|text|border|ring|from|to|via|accent|divide|placeholder|fill|stroke|outline|shadow|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?\b/g

function paletteClassesIn(path: string): string[] {
  return readFileSync(path, 'utf8').match(PALETTE_CLASS) ?? []
}

const MIGRATED = [
  'FeedView',
  'TimerCard',
  'HistoryView',
  'AnalyticsView',
  'ScreenTitle',
]

describe('theme tokens', () => {
  it.each(MIGRATED)('%s uses no hardcoded palette classes', (name) => {
    expect(paletteClassesIn(`src/components/${name}.tsx`)).toEqual([])
  })
})
