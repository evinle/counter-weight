import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DateTimeInput } from '../components/DateTimeInput'

// Fixed "now" so slider ranges are deterministic
const NOW = new Date(2026, 5, 29, 10, 0, 0) // Mon 29 Jun 2026 10:00

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  // jsdom returns zero-dimension rects; mock so SVG center = (120, 120) for a 240×240 element
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 240, bottom: 240,
    width: 240, height: 240, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function renderPicker(value: Date, onChange = vi.fn(), maxDate?: Date) {
  return render(<DateTimeInput value={value} onChange={onChange} maxDate={maxDate} />)
}

describe('DateTimeInput — day slider', () => {
  it('renders a slider with today as minimum and 28 days from today as maximum', () => {
    renderPicker(NOW)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '28')
  })

  it('shows "Today" label when selected date is today', () => {
    renderPicker(NOW)
    expect(screen.getByText(/Today/)).toBeInTheDocument()
  })

  it('shows "Tomorrow" when selected date is one day ahead', () => {
    const tomorrow = new Date(2026, 5, 30, 10, 0, 0)
    renderPicker(tomorrow)
    expect(screen.getByText(/Tomorrow/)).toBeInTheDocument()
  })

  it('shows formatted day label for dates beyond tomorrow', () => {
    const inThreeDays = new Date(2026, 6, 2, 10, 0, 0) // Thu 2 Jul
    renderPicker(inThreeDays)
    expect(screen.getByText(/Thu 2 Jul/)).toBeInTheDocument()
  })

  it('preserves the existing time when the slider date changes', () => {
    const onChange = vi.fn()
    const value = new Date(2026, 5, 29, 14, 30, 0) // 29 Jun at 14:30
    renderPicker(value, onChange)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1' } }) // move to tomorrow

    expect(onChange).toHaveBeenCalledOnce()
    const emitted: Date = onChange.mock.calls[0][0]
    expect(emitted.getHours()).toBe(14)
    expect(emitted.getMinutes()).toBe(30)
    expect(emitted.getDate()).toBe(30) // tomorrow
  })

  it('renders a calendar escape hatch button', () => {
    renderPicker(NOW)
    expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument()
  })

  it('renders edge labels showing today (+0d) and 28 days out (+28d)', () => {
    renderPicker(NOW)
    expect(screen.getAllByText(/\+0d/).length).toBeGreaterThan(0)
    expect(screen.getByText(/\+28d/)).toBeInTheDocument()
  })

  it('date input overlay is present in the DOM (not sr-only hidden)', () => {
    const { container } = renderPicker(NOW)
    const dateInput = container.querySelector('input[type="date"]')
    expect(dateInput).toBeInTheDocument()
    expect(dateInput).not.toHaveClass('sr-only')
  })
})

describe('DateTimeInput — clock dial', () => {
  it('renders the dial in hour mode initially (shows hour labels 1–12)', () => {
    renderPicker(NOW)
    // All 12 hour labels should be visible
    for (let h = 1; h <= 12; h++) {
      expect(screen.getByTestId(`hour-label-${h}`)).toBeInTheDocument()
    }
  })

  it('displays the current hour and minute in the center display', () => {
    const value = new Date(2026, 5, 29, 14, 30, 0) // 2:30 PM
    renderPicker(value)
    expect(screen.getByTestId('dial-hour')).toHaveTextContent('2')
    expect(screen.getByTestId('dial-minute')).toHaveTextContent('30')
  })

  it('shows PM indicator when value is in the afternoon', () => {
    renderPicker(new Date(2026, 5, 29, 14, 0, 0))
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('🌙')
  })

  it('shows AM indicator when value is in the morning', () => {
    renderPicker(new Date(2026, 5, 29, 9, 0, 0))
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('☀️')
  })

  it('stays on hour phase after confirming hour', () => {
    renderPicker(NOW)
    const face = screen.getByTestId('dial-face')
    fireEvent.pointerDown(face, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(face, { clientX: 0, clientY: 0 })
    expect(screen.getByTestId('hour-label-12')).toBeInTheDocument()
  })

  it('calls onChange when hour is confirmed and again when minute is confirmed', () => {
    const onChange = vi.fn()
    renderPicker(NOW, onChange)
    const face = screen.getByTestId('dial-face')

    // Confirm hour — emits immediately, stays on hour phase
    fireEvent.pointerDown(face, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(face, { clientX: 0, clientY: 0 })
    expect(onChange).toHaveBeenCalledOnce()

    // Explicitly switch to minute phase
    fireEvent.click(screen.getByTestId('dial-minute'))

    // Confirm minute — emits again
    fireEvent.pointerDown(face, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(face, { clientX: 0, clientY: 0 })
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0]).toBeInstanceOf(Date)
  })

  it('tapping the hour display segment switches back to hour ring', () => {
    renderPicker(NOW)
    // Explicitly switch to minute phase
    fireEvent.click(screen.getByTestId('dial-minute'))
    expect(screen.getByTestId('minute-label-0')).toBeInTheDocument()

    // Tap hour segment → back to hour ring
    fireEvent.click(screen.getByTestId('dial-hour'))
    expect(screen.getByTestId('hour-label-12')).toBeInTheDocument()
  })

  it('swiping right on the center area toggles AM/PM', () => {
    renderPicker(new Date(2026, 5, 29, 9, 0, 0)) // 9 AM
    const face = screen.getByTestId('dial-face')

    // In jsdom getBoundingClientRect returns zeros, so SVG center = (120, 120) for a 240×240 element.
    // Fire pointerDown in the center region, then swipe 60px right.
    fireEvent.pointerDown(face, { clientX: 120, clientY: 120 })
    fireEvent.pointerUp(face, { clientX: 180, clientY: 120 })

    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('🌙')
  })
})
