import { Cron } from 'croner'
import type { RecurrenceRule } from '../db/schema.js'

export function computeNextOccurrence(rule: RecurrenceRule, now: Date): Date {
  const job = new Cron(rule.cron, { timezone: rule.tz })
  const next = job.nextRun(now)
  if (!next) throw new Error(`No next occurrence for cron "${rule.cron}"`)
  return next
}
