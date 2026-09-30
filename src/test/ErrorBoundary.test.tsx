import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from '../components/ErrorBoundary'

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message)
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors; keep test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('all good')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces a crashed subtree with an error message', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('shows what went wrong so it can be reported', () => {
    render(
      <ErrorBoundary>
        <Boom message="steps cannot be greater than 31" />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('steps cannot be greater than 31')
  })

  it('reloads the window when Reload is pressed', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('catches an error thrown by a component deep in the tree', () => {
    render(
      <ErrorBoundary>
        <div>
          <section>
            <Boom />
          </section>
        </div>
      </ErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
