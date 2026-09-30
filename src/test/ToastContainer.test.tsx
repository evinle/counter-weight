import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ToastContainer } from '../components/ToastContainer'
import { useToastStore } from '../hooks/useToast'
import type { Toast } from '../hooks/useToast'

function showToast(variant: Toast['variant']) {
  useToastStore.getState().show({ message: 'Hello', variant })
}

function toastOf(message: string) {
  const el = screen.getByText(message).parentElement
  if (!el) throw new Error('toast has no container')
  return el
}

describe('ToastContainer variants', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('tints a success toast with the success colour', () => {
    showToast('success')

    render(<ToastContainer />)

    expect(toastOf('Hello')).toHaveClass('bg-success-soft', 'border-success')
  })

  it('tints an error toast with the danger colour', () => {
    showToast('error')

    render(<ToastContainer />)

    expect(toastOf('Hello')).toHaveClass('bg-danger-soft', 'border-danger')
  })

  it('renders a default toast on the neutral surface', () => {
    showToast('default')

    render(<ToastContainer />)

    expect(toastOf('Hello')).toHaveClass('bg-surface', 'border-line')
  })
})
