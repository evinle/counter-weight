import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RecurrencePicker } from '../components/RecurrencePicker'

const NOW = new Date('2026-06-21T09:00:00Z') // Sunday=dow0, dom=21, UTC 09:00

function scheduleSelect() {
  return screen.getByRole('combobox', { name: /schedule/i })
}

describe('RecurrencePicker — default state', () => {
  it('defaults to Every day', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('daily')
  })

  it('shows a time-of-day dial for Every day', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('primary select has exactly: Every day, Every week, Every month, Every N days, Every N hours/minutes', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    const options = Array.from(
      scheduleSelect().querySelectorAll('option'),
    ).map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(['daily', 'weekly', 'monthly', 'every-n-days', 'every-n-hours-minutes'])
  })

  it('does not render any numeric spinner input', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(document.querySelector('input[inputmode="numeric"]')).toBeNull()
    expect(document.querySelector('input[type="number"]')).toBeNull()
  })
})

describe('RecurrencePicker — time-of-day dial', () => {
  it('shows dial-face for Daily preset', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('shows dial-face for Weekly preset', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'weekly' } })
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('shows dial-face for Monthly preset', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('shows dial-face for Every N days preset', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('toggle shows ☀️ emoji (not 0–11 text) when in AM', () => {
    // NOW is 09:00 UTC → AM
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('☀️')
  })
})

describe('RecurrencePicker — interval dial (EveryNHoursMinutes)', () => {
  it('shows dial-face when Every N hours/minutes is selected', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-hours-minutes' } })
    expect(screen.getByTestId('dial-face')).toBeInTheDocument()
  })

  it('interval dial toggle shows "0–11" text, not ☀️ emoji', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-hours-minutes' } })
    expect(screen.getByTestId('ampm-icon')).toHaveTextContent('0–11')
  })

  it('only one dial-face is rendered — the time-of-day dial is hidden', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-hours-minutes' } })
    expect(screen.getAllByTestId('dial-face')).toHaveLength(1)
  })
})

describe('RecurrencePicker — Every week', () => {
  it('shows day toggles when Every week is selected', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'weekly' } })
    expect(screen.getByRole('button', { name: /^sun$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^mon$/i })).toBeInTheDocument()
  })

  it('defaults day toggle to today (Sunday = 0)', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'weekly' } })
    const sun = screen.getByRole('button', { name: /^sun$/i })
    expect(sun.className).toContain('bg-blue-600')
    const mon = screen.getByRole('button', { name: /^mon$/i })
    expect(mon.className).toContain('bg-slate-700')
  })

  it('emits correct weekly cron on day toggle', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'weekly' } })
    // Sunday already selected; add Monday
    fireEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 * * 0,1')
  })
})

describe('RecurrencePicker — Every month', () => {
  it('shows a grid of numbered tiles 1–31 and an L tile', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(screen.getByRole('button', { name: 'Day 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day 15' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day 31' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last day' })).toBeInTheDocument()
  })

  it('defaults active tile to today (dom=21)', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(screen.getByRole('button', { name: 'Day 21' }).className).toContain('bg-blue-600')
  })

  it('clicking tile 15 emits the correct cron', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Day 15' }))
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 15 * *')
  })

  it('does not render any numeric spinner input', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(document.querySelector('input[type="number"]')).toBeNull()
  })

  it('clicking L tile makes it active and emits last-day cron', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Last day' }))
    expect(screen.getByRole('button', { name: 'Last day' }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Day 21' }).className).not.toContain('bg-blue-600')
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 L * *')
  })

  it('clicking a numbered tile after L clears the L active state', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Last day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Day 10' }))
    expect(screen.getByRole('button', { name: 'Last day' }).className).not.toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Day 10' }).className).toContain('bg-blue-600')
  })
})

describe('RecurrencePicker — Every N days', () => {
  it('shows a range input with min=2 max=90', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    const slider = screen.getByRole('slider', { name: /every n days/i })
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('min', '2')
    expect(slider).toHaveAttribute('max', '90')
  })

  it('shows "Every 2 days" label by default', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    expect(screen.getByText('Every 2 days')).toBeInTheDocument()
  })

  it('changing the slider updates the label and emits the correct cron', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    fireEvent.change(screen.getByRole('slider', { name: /every n days/i }), { target: { value: '7' } })
    expect(screen.getByText('Every 7 days')).toBeInTheDocument()
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 */7 * *')
  })

  it('does not render any numeric spinner input', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    expect(document.querySelector('input[type="number"]')).toBeNull()
  })
})

describe('RecurrencePicker — backwards compat pre-population', () => {
  it('pre-populates Every day from a stored daily cron, restoring hour:minute on the dial', () => {
    render(<RecurrencePicker value={{ cron: '30 14 * * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    // 14:00 → 2 PM → 12h display: hour=2
    expect(scheduleSelect()).toHaveValue('daily')
    expect(screen.getByTestId('dial-hour')).toHaveTextContent('2')
    expect(screen.getByTestId('dial-minute')).toHaveTextContent('30')
  })

  it('pre-populates Every week from a stored single-day weekly cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 * * 3', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('weekly')
  })

  it('pre-populates Every week from a stored custom-weekly cron with correct days', () => {
    render(<RecurrencePicker value={{ cron: '0 9 * * 1,3,5', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('weekly')
    expect(screen.getByRole('button', { name: /^mon$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^wed$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^fri$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^sun$/i }).className).toContain('bg-slate-700')
  })

  it('pre-populates Every month from a stored monthly cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 15 * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('monthly')
  })

  it('pre-populates Every month with L tile active from an L-dom cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 L * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('monthly')
    expect(screen.getByRole('button', { name: 'Last day' }).className).toContain('bg-blue-600')
  })

  it('pre-populates Every N days from a stored every-n-days cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 */5 * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('every-n-days')
    expect(screen.getByText('Every 5 days')).toBeInTheDocument()
  })

  it('pre-populates Every N hours/minutes from a stored HM cron', () => {
    // everyH=2 → hourTo12h(2) → { hour: 2, isPm: false } → interval dial shows 2
    render(<RecurrencePicker value={{ cron: '0 */2 * * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('every-n-hours-minutes')
    expect(screen.getByTestId('dial-hour')).toHaveTextContent('2')
  })

  it('falls back to Every day for an unclassifiable cron', () => {
    render(<RecurrencePicker value={{ cron: 'bad cron', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('daily')
  })

  it('pre-populates old weekday cron (1-5) as Every week with Mon-Fri active', () => {
    render(<RecurrencePicker value={{ cron: '0 8 * * 1-5', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('weekly')
    expect(screen.getByRole('button', { name: /^mon$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^fri$/i }).className).toContain('bg-blue-600')
  })
})

describe('RecurrencePicker — next occurrence preview', () => {
  it('renders a preview element below the controls', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByTestId('next-occurrence-preview')).toBeInTheDocument()
  })

  it('preview is formatted as "Next: dd/mm/yyyy HH:mm"', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    const preview = screen.getByTestId('next-occurrence-preview')
    expect(preview.textContent).toMatch(/^Next: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })

  it('preview updates when preset changes to Every month', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    const after = screen.getByTestId('next-occurrence-preview').textContent
    expect(after).toMatch(/^Next: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})
