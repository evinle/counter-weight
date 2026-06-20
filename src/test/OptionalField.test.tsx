import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OptionalField } from '../components/OptionalField'

describe('OptionalField', () => {
  it('inactive: shows label and activate button, hides children', () => {
    render(
      <OptionalField
        label="Remind me before"
        activateLabel="Set time"
        clearLabel="Cancel reminder"
        active={false}
        onActivate={() => {}}
        onClear={() => {}}
      >
        <span>content</span>
      </OptionalField>,
    )

    expect(screen.getByText('Remind me before')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set time/i })).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })

  it('inactive: clicking activate button calls onActivate', () => {
    const onActivate = vi.fn()

    render(
      <OptionalField
        label="Remind me before"
        activateLabel="Set time"
        clearLabel="Cancel reminder"
        active={false}
        onActivate={onActivate}
        onClear={() => {}}
      >
        <span>content</span>
      </OptionalField>,
    )

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('active: shows children and clear button, hides activate button', () => {
    render(
      <OptionalField
        label="Remind me before"
        activateLabel="Set time"
        clearLabel="Cancel reminder"
        active={true}
        onActivate={() => {}}
        onClear={() => {}}
      >
        <span>content</span>
      </OptionalField>,
    )

    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel reminder/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set time/i })).not.toBeInTheDocument()
  })

  it('active: clicking clear button calls onClear', () => {
    const onClear = vi.fn()

    render(
      <OptionalField
        label="Remind me before"
        activateLabel="Set time"
        clearLabel="Cancel reminder"
        active={true}
        onActivate={() => {}}
        onClear={onClear}
      >
        <span>content</span>
      </OptionalField>,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel reminder/i }))

    expect(onClear).toHaveBeenCalledOnce()
  })
})
