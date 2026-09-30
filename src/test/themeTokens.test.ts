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

// Colour literals (`#3b82f6`, `rgb(…)`) bypass the theme just like palette classes do.
// These files hold colours that no theme token can stand in for.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g
const LITERAL_ALLOWED: Record<string, string> = {
  'LoginView.tsx': 'Google logo brand colours',
  'GroupCreateEditView.tsx': 'user-selectable group colour swatches',
  'TagPicker.tsx': 'user-selectable tag colour swatches and chip fallback',
  'TimerCard.tsx': 'tag chip fallback colour',
}

describe('theme tokens: colour literals', () => {
  it.each(componentFiles.filter((f) => !(f in LITERAL_ALLOWED)))(
    '%s has no hardcoded colour literals',
    (file) => {
      const source = readFileSync(`${COMPONENTS_DIR}/${file}`, 'utf8')

      expect(source.match(COLOUR_LITERAL) ?? []).toEqual([])
    },
  )
})
