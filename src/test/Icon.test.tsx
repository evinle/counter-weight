import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TrashIcon } from '../icons/TrashIcon'
import { PlayIcon } from '../icons/PlayIcon'

function svgOf(container: HTMLElement) {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no svg rendered')
  return svg
}

describe('Icon', () => {
  it('is a stroke icon at the small size by default', () => {
    const { container } = render(<TrashIcon />)

    expect(svgOf(container)).toHaveClass('icon', 'icon-sm')
  })

  it('uses the requested size instead of the default', () => {
    const { container } = render(<TrashIcon className="icon-lg" />)

    expect(svgOf(container)).toHaveClass('icon-lg')
    expect(svgOf(container)).not.toHaveClass('icon-sm')
  })

  it('passes colour classes through so icons follow the text colour tokens', () => {
    const { container } = render(<TrashIcon className="icon-md text-danger" />)

    expect(svgOf(container)).toHaveClass('text-danger')
  })

  it('renders solid icons with the filled variant', () => {
    const { container } = render(<PlayIcon />)

    expect(svgOf(container)).toHaveClass('icon-filled')
    expect(svgOf(container)).not.toHaveClass('icon')
  })

  it('is hidden from assistive tech', () => {
    const { container } = render(<TrashIcon />)

    expect(svgOf(container)).toHaveAttribute('aria-hidden', 'true')
  })
})
