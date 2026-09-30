import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BottomTabBar } from '../components/BottomTabBar'
import { Tab } from '../lib/navigation'

function renderBar(activeTab: Tab) {
  return render(<BottomTabBar activeTab={activeTab} onTabChange={() => {}} onCreateNew={() => {}} />)
}

describe('BottomTabBar', () => {
  it('highlights the active tab with the accent colour', () => {
    renderBar(Tab.History)

    expect(screen.getByRole('button', { name: 'History' })).toHaveClass('text-accent')
  })

  it('mutes the inactive tabs', () => {
    renderBar(Tab.History)

    const timers = screen.getByRole('button', { name: 'Timers' })
    expect(timers).toHaveClass('text-ink-faint')
    expect(timers).not.toHaveClass('text-accent')
  })

  it('paints the create button with the accent and its dark on-accent text', () => {
    renderBar(Tab.Timers)

    const plus = screen.getByRole('button', { name: 'Create new timer' }).firstElementChild
    expect(plus).toHaveClass('bg-accent', 'text-on-accent')
  })
})
