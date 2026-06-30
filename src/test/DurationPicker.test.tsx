import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DurationPicker } from '../components/DurationPicker'

// Fixed "now" so slider edge labels are deterministic
const NOW = new Date(2026, 5, 29, 10, 0, 0) // Mon 29 Jun 2026 10:00

interface DurationValue {
  days: number
  hours: number
  minutes: number
}

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

const zero = { days: 0, hours: 0, minutes: 0 } satisfies DurationValue

function renderPicker(
  value: DurationValue = zero,
  onChange = vi.fn(),
  maxDays?: number,
) {
  return render(
    <DurationPicker value={value} onChange={onChange} maxDays={maxDays} />,
  )
}

describe('DurationPicker — days slider', () => {
  it('renders a range input with min=0 and max=28 by default', () => {
    // Arrange + Act
    renderPicker()

    // Assert
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '28')
  })

  it('respects maxDays prop by setting slider max attribute', () => {
    // Arrange + Act
    renderPicker(zero, vi.fn(), 7)

    // Assert
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('max', '7')
  })

  it('shows "N days" label reflecting current days value', () => {
    // Arrange
    const value = { days: 3, hours: 0, minutes: 0 } satisfies DurationValue

    // Act
    renderPicker(value)

    // Assert
    expect(screen.getByText(/^3 days/)).toBeInTheDocument()
  })

  it('shows "1 day" (singular) when days is 1', () => {
    // Arrange
    const value = { days: 1, hours: 0, minutes: 0 } satisfies DurationValue

    // Act
    renderPicker(value)

    // Assert
    expect(screen.getByText(/^1 day/)).toBeInTheDocument()
  })

  it('calls onChange with updated days when slider changes', () => {
    // Arrange
    const onChange = vi.fn()
    renderPicker(zero, onChange)
    const slider = screen.getByRole('slider')

    // Act
    fireEvent.change(slider, { target: { value: '5' } })

    // Assert
    expect(onChange).toHaveBeenCalledOnce()
    const emitted: DurationValue = onChange.mock.calls[0][0]
    expect(emitted.days).toBe(5)
    expect(emitted.hours).toBe(0)
    expect(emitted.minutes).toBe(0)
  })

  it('renders left edge label containing "+0d"', () => {
    // Arrange + Act
    renderPicker()

    // Assert
    expect(screen.getByText(/\+0d/)).toBeInTheDocument()
  })

  it('renders right edge label containing "+28d" by default', () => {
    // Arrange + Act
    renderPicker()

    // Assert
    expect(screen.getByText(/\+28d/)).toBeInTheDocument()
  })

  it('renders right edge label containing "+7d" when maxDays={7}', () => {
    // Arrange + Act
    renderPicker(zero, vi.fn(), 7)

    // Assert
    expect(screen.getByText(/\+7d/)).toBeInTheDocument()
  })
})

describe('DurationPicker — clock dial', () => {
  it('renders the dial face element', () => {
    // Arrange + Act
    renderPicker()

    // Assert
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('shows interval toggle label "0–11" in AM, confirming interval mode', () => {
    // Arrange + Act — hours=0 is AM → isPm=false → toggleLabel="0–11" (not ☀️ emoji)
    renderPicker()

    // Assert
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('0–11')
  })

  it('shows interval toggle label "12–23" when value is in PM range', () => {
    // Arrange
    const value = { days: 0, hours: 14, minutes: 0 } satisfies DurationValue

    // Act
    renderPicker(value)

    // Assert
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('12–23')
  })

  it('calls onChange with updated hours after hour confirm via dial pointer gesture', () => {
    // Arrange
    const onChange = vi.fn()
    const value = { days: 0, hours: 0, minutes: 0 } satisfies DurationValue
    renderPicker(value, onChange)
    const face = screen.getByTestId('dial-face')

    // Act — pointerDown outside center (120,120) at (240,120) sets dragging=true.
    // angle = atan2(240-120, -(120-120)) = atan2(120, 0) = 90°.
    // angleToHour(90) = round(90/30) % 12 || 12 = 3.
    // hour12To24(3, isPm=false) = 3 % 12 = 3 → onChange({ days:0, hours:3, minutes:0 }).
    fireEvent.pointerDown(face, { clientX: 240, clientY: 120 })
    fireEvent.pointerUp(face, { clientX: 240, clientY: 120 })

    // Assert
    expect(onChange).toHaveBeenCalledOnce()
    const emitted: DurationValue = onChange.mock.calls[0][0]
    expect(emitted.hours).toBe(3)
    expect(emitted.days).toBe(0)
    expect(emitted.minutes).toBe(0)
  })

  it('reflects updated hours and minutes when value prop changes externally', () => {
    // Arrange
    const initial = { days: 0, hours: 2, minutes: 30 } satisfies DurationValue
    const { rerender } = renderPicker(initial)

    // Act — re-render with a new object reference (hours=14 PM, minutes=45)
    const updated = { days: 0, hours: 14, minutes: 45 } satisfies DurationValue
    rerender(<DurationPicker value={updated} onChange={vi.fn()} />)

    // Assert — interval mode: isPm=true, selectedHour=2 → hourDisplay = 2+12 = 14
    expect(screen.getByTestId('dial-hour')).toHaveTextContent('14')
    expect(screen.getByTestId('dial-minute')).toHaveTextContent('45')
  })
})
