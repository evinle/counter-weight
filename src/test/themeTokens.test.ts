import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Tailwind palette utilities like `bg-slate-800`, `text-white`, `hover:bg-blue-500/20`.
// Components must use the theme tokens from index.css (`bg-surface`, `text-ink`, …) instead.
// Hex values in user data (tag and group colours) and brand marks (Google logo) are not checked.
const PALETTE_CLASS =
  /\b(?:bg|text|border|ring|ring-offset|from|to|via|accent|divide|placeholder|fill|stroke|outline|shadow|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?\b/g

const COMPONENTS_DIR = 'src/components'
const componentFiles = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.tsx'))

describe('theme tokens', () => {
  it.each(componentFiles)('%s uses no hardcoded palette classes', (file) => {
    const source = readFileSync(`${COMPONENTS_DIR}/${file}`, 'utf8')

    expect(source.match(PALETTE_CLASS) ?? []).toEqual([])
  })
})
