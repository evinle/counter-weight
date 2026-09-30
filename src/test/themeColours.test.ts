import { existsSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// The manifest, the meta tag and the generated icons cannot use oklch or CSS variables, so they
// carry hex copies of the theme tokens. These tests derive the hex from index.css and compare.
const css = readFileSync('src/index.css', 'utf8')
const viteConfig = readFileSync('vite.config.ts', 'utf8')
const indexHtml = readFileSync('index.html', 'utf8')
const iconScript = readFileSync('scripts/gen-icons.ts', 'utf8')

function oklchToHex(L: number, C: number, H: number): string {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const encode = (x: number) => {
    const c = Math.max(0, Math.min(1, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return '#' + linear.map((x) => Math.round(encode(x) * 255).toString(16).padStart(2, '0')).join('')
}

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`))
  if (!match) throw new Error(`token --color-${name} not found in index.css`)
  return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]))
}

describe('theme colours outside the stylesheet', () => {
  const canvas = tokenHex('canvas')

  it('sets the browser theme-color meta tag to the canvas colour', () => {
    expect(indexHtml).toContain(`<meta name="theme-color" content="${canvas}"`)
  })

  it('sets the manifest theme and background colours to the canvas colour', () => {
    expect(viteConfig).toContain(`theme_color: "${canvas}"`)
    expect(viteConfig).toContain(`background_color: "${canvas}"`)
  })

  it.each(['canvas', 'surface', 'accent'])('generates icons with the %s token colour', (token) => {
    expect(iconScript).toContain(`const ${token.toUpperCase()} = "${tokenHex(token)}"`)
  })
})

describe('app icons', () => {
  const manifestIcons = [...viteConfig.matchAll(/\{\s*src:\s*"([^"]+)"([^}]*)\}/g)].map((m) => ({
    src: m[1],
    attrs: m[2],
  }))

  it('lists a maskable icon so Android can shape it', () => {
    expect(manifestIcons.some((i) => i.attrs.includes('purpose: "maskable"'))).toBe(true)
  })

  it.each(manifestIcons.map((i) => i.src))('has the manifest icon file %s', (src) => {
    expect(existsSync(`public${src}`)).toBe(true)
  })

  it('links an apple-touch-icon for iOS, and the file exists', () => {
    const href = indexHtml.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1]
    expect(href).toBeDefined()
    expect(existsSync(`public${href}`)).toBe(true)
  })
})
