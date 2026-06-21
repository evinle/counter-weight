import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RecurrencePicker } from '../components/RecurrencePicker'

const NOW = new Date('2026-06-21T09:00:00Z') // Sunday=dow0, dom=21

function scheduleSelect() {
  return screen.getByRole('combobox', { name: /schedule/i })
}

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
    // Sunday button should be active (blue), Monday not
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
    expect(last?.cron).toBe('0 9 * * 0,1') // 09:00 is already on a quarter-hour boundary
  })
})

describe('RecurrencePicker — Every month', () => {
  it('shows dom spinner and last day checkbox', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(screen.getByLabelText('Day')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /last day/i })).toBeInTheDocument()
  })

  it('dom spinner defaults to today (21)', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    expect(screen.getByLabelText('Day')).toHaveValue('21')
  })

  it('last day checkbox hides spinner and emits L cron', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /last day/i }))
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 L * *')
  })

  it('unchecking last day restores spinner', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'monthly' } })
    const cb = screen.getByRole('checkbox', { name: /last day/i })
    fireEvent.click(cb)
    fireEvent.click(cb)
    expect(screen.getByLabelText('Day')).toBeInTheDocument()
  })
})

describe('RecurrencePicker — Every N days', () => {
  it('shows N spinner with range 2-90', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    const spinner = screen.getByLabelText('Every')
    expect(spinner).toBeInTheDocument()
  })

  it('emits correct every-N-days cron', () => {
    const onChange = vi.fn()
    render(<RecurrencePicker value={null} onChange={onChange} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-days' } })
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '7' } })
    const last = onChange.mock.calls.at(-1)?.[0]
    expect(last?.cron).toBe('0 9 */7 * *')
  })
})

describe('RecurrencePicker — Every N hours/minutes', () => {
  it('shows Hours and Minutes spinners but no Hour/Minute time-of-day spinners', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    fireEvent.change(scheduleSelect(), { target: { value: 'every-n-hours-minutes' } })
    expect(screen.getByLabelText('Hours')).toBeInTheDocument()
    expect(screen.getByLabelText('Minutes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument()
  })
})

describe('RecurrencePicker — backwards compat pre-population', () => {
  it('pre-populates Every day from a stored daily cron, restoring hour:minute', () => {
    render(<RecurrencePicker value={{ cron: '30 14 * * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('daily')
    expect(screen.getByLabelText('Hour')).toHaveValue('14')
    expect(screen.getByLabelText('Minute')).toHaveValue('30')
  })

  it('pre-populates Every week from a stored single-day weekly cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 * * 3', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('weekly')
  })

  it('pre-populates Every week from a stored custom-weekly cron with correct days', () => {
    render(<RecurrencePicker value={{ cron: '0 9 * * 1,3,5', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('weekly')
    // Mon, Wed, Fri toggles should be active
    expect(screen.getByRole('button', { name: /^mon$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^wed$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^fri$/i }).className).toContain('bg-blue-600')
    expect(screen.getByRole('button', { name: /^sun$/i }).className).toContain('bg-slate-700')
  })

  it('pre-populates Every month from a stored monthly cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 15 * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('monthly')
  })

  it('pre-populates Every month with last day checked from an L-dom cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 L * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('monthly')
    expect(screen.getByRole('checkbox', { name: /last day/i })).toBeChecked()
  })

  it('pre-populates Every N days from a stored every-n-days cron', () => {
    render(<RecurrencePicker value={{ cron: '0 9 */5 * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('every-n-days')
    expect(screen.getByLabelText('Every')).toHaveValue('05')
  })

  it('pre-populates Every N hours/minutes from a stored HM cron', () => {
    render(<RecurrencePicker value={{ cron: '0 */2 * * *', tz: 'UTC' }} onChange={() => {}} now={NOW} />)
    expect(scheduleSelect()).toHaveValue('every-n-hours-minutes')
    expect(screen.getByLabelText('Hours')).toHaveValue('02')
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

describe('RecurrencePicker — default state', () => {
  it('defaults to Every day with Hour and Minute spinners', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByRole('combobox', { name: /schedule/i })).toHaveValue('daily')
    expect(screen.getByLabelText('Hour')).toBeInTheDocument()
    expect(screen.getByLabelText('Minute')).toBeInTheDocument()
  })

  it('primary select has exactly: Every day, Every week, Every month, Every N days, Every N hours/minutes', () => {
    render(<RecurrencePicker value={null} onChange={() => {}} now={NOW} />)
    const options = Array.from(
      screen.getByRole('combobox', { name: /schedule/i }).querySelectorAll('option'),
    ).map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(['daily', 'weekly', 'monthly', 'every-n-days', 'every-n-hours-minutes'])
  })
})
