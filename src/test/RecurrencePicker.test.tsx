import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RecurrencePicker } from '../components/RecurrencePicker'

// Wednesday 2026-06-03 09:00 UTC — dow=3, dom=3
const TARGET = new Date('2026-06-03T09:00:00Z')
const DAILY = { cron: '0 9 * * *', tz: 'UTC' }

function presetSelect() {
  return screen.getByRole('combobox', { name: /recurrence/i })
}

function hourSpinner() {
  return screen.getByLabelText('Hour')
}

function minuteSpinner() {
  return screen.getByLabelText('Minute')
}

describe('RecurrencePicker — default state', () => {
  it('defaults to Every day with time spinners visible', () => {
    render(
      <RecurrencePicker value={null} targetDatetime={TARGET} onChange={() => {}} />,
    )

    expect(presetSelect()).toHaveValue('daily')
    expect(hourSpinner()).toBeInTheDocument()
    expect(minuteSpinner()).toBeInTheDocument()
  })
})

describe('RecurrencePicker — presets', () => {
  it('Every day: calls onChange with daily cron on preset change', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'daily' } })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cron: '0 9 * * *' }),
    )
  })

  it('Every weekday: calls onChange with weekday cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'weekday' } })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cron: '0 9 * * 1-5' }),
    )
  })

  it('Every week: uses day-of-week from targetDatetime', () => {
    const onChange = vi.fn()
    // TARGET is Wednesday = dow 3
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'weekly' } })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cron: '0 9 * * 3' }),
    )
  })

  it('Every month: uses day-of-month from targetDatetime', () => {
    const onChange = vi.fn()
    // TARGET is the 3rd
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'monthly' } })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cron: '0 9 3 * *' }),
    )
  })

  it('changing time updates the cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(hourSpinner(), { target: { value: '14' } })
    fireEvent.change(minuteSpinner(), { target: { value: '30' } })

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cron: '30 14 * * *' }),
    )
  })

  it('includes the browser IANA timezone in the rule', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'daily' } })

    const call = onChange.mock.calls[0][0]
    expect(typeof call.tz).toBe('string')
    expect(call.tz.length).toBeGreaterThan(0)
  })
})

describe('RecurrencePicker — Custom', () => {
  function customSelect() {
    return screen.getByRole('combobox', { name: /repeat/i })
  }

  it('selecting Custom reveals a Repeat select with four flavours', () => {
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={() => {}} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })

    const repeat = customSelect()
    const options = Array.from(repeat.querySelectorAll('option')).map((o) => o.value)
    expect(options).toContain('weekly')
    expect(options).toContain('monthly')
    expect(options).toContain('every-n-days')
    expect(options).toContain('every-n-hours-minutes')
  })

  it('Custom Weekly: day toggles appear; correct cron on selection', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })
    fireEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^wed$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^fri$/i }))

    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.cron).toBe('0 9 * * 1,3,5')
  })

  it('Custom Monthly: dom stepper drives the cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })
    fireEvent.change(customSelect(), { target: { value: 'monthly' } })
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } })

    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.cron).toBe('0 9 15 * *')
  })

  it('Custom Every N days: produces */N cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })
    fireEvent.change(customSelect(), { target: { value: 'every-n-days' } })
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '3' } })

    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.cron).toBe('0 9 */3 * *')
  })

  it('Custom Every N hours: no time spinners, correct cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })
    fireEvent.change(customSelect(), { target: { value: 'every-n-hours-minutes' } })
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '2' } })

    expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument()
    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.cron).toBe('0 */2 * * *')
  })

  it('Custom Every N minutes: produces */N minute cron', () => {
    const onChange = vi.fn()
    render(
      <RecurrencePicker value={DAILY} targetDatetime={TARGET} onChange={onChange} />,
    )

    fireEvent.change(presetSelect(), { target: { value: 'custom' } })
    fireEvent.change(customSelect(), { target: { value: 'every-n-hours-minutes' } })
    fireEvent.change(screen.getByRole('combobox', { name: /unit/i }), {
      target: { value: 'minutes' },
    })
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '30' } })

    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.cron).toBe('*/30 * * * *')
  })
})

describe('RecurrencePicker — pre-population', () => {
  it('pre-populates "Every day" from a daily cron rule', () => {
    render(
      <RecurrencePicker
        value={{ cron: '30 14 * * *', tz: 'UTC' }}
        targetDatetime={TARGET}
        onChange={() => {}}
      />,
    )

    expect(presetSelect()).toHaveValue('daily')
    expect(hourSpinner()).toHaveValue('14')
    expect(minuteSpinner()).toHaveValue('30')
  })

  it('pre-populates "Every weekday" from a weekday cron rule', () => {
    render(
      <RecurrencePicker
        value={{ cron: '0 8 * * 1-5', tz: 'UTC' }}
        targetDatetime={TARGET}
        onChange={() => {}}
      />,
    )

    expect(presetSelect()).toHaveValue('weekday')
  })

  it('pre-populates "Every week" from a weekly cron rule', () => {
    render(
      <RecurrencePicker
        value={{ cron: '0 9 * * 3', tz: 'UTC' }}
        targetDatetime={TARGET}
        onChange={() => {}}
      />,
    )

    expect(presetSelect()).toHaveValue('weekly')
  })

  it('pre-populates "Every month" from a monthly cron rule', () => {
    render(
      <RecurrencePicker
        value={{ cron: '0 9 15 * *', tz: 'UTC' }}
        targetDatetime={TARGET}
        onChange={() => {}}
      />,
    )

    expect(presetSelect()).toHaveValue('monthly')
  })
})
