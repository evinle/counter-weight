import type { Timer } from '../db/schema'
import { isTimerStatus, isPriority } from '../db/schema'

export interface ImportResult {
  timers: Timer[]
  skipped: number
}

type VersionHandler = (rawTimers: unknown[]) => Omit<Timer, 'id'>[]

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function coerceTimer(raw: unknown): Omit<Timer, 'id'> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const title = typeof r.title === 'string' && r.title.length > 0 ? r.title : null
  const status = typeof r.status === 'string' && isTimerStatus(r.status) ? r.status : null
  const targetDatetime = parseDate(r.targetDatetime)

  if (!title || !status || !targetDatetime) return null

  return {
    title,
    description: typeof r.description === 'string' ? r.description : null,
    emoji: typeof r.emoji === 'string' ? r.emoji : null,
    targetDatetime,
    originalTargetDatetime: parseDate(r.originalTargetDatetime) ?? targetDatetime,
    status,
    priority: typeof r.priority === 'string' && isPriority(r.priority) ? r.priority : 'medium',
    isFlagged: typeof r.isFlagged === 'boolean' ? r.isFlagged : false,
    groupId: typeof r.groupId === 'number' ? r.groupId : null,
    recurrenceRule:
      r.recurrenceRule &&
      typeof r.recurrenceRule === 'object' &&
      typeof (r.recurrenceRule as Record<string, unknown>).cron === 'string' &&
      typeof (r.recurrenceRule as Record<string, unknown>).tz === 'string'
        ? (r.recurrenceRule as { cron: string; tz: string })
        : null,
    createdAt: parseDate(r.createdAt) ?? new Date(),
    updatedAt: parseDate(r.updatedAt) ?? new Date(),
  }
}

function handleV1(rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  return rawTimers.flatMap(r => {
    const t = coerceTimer(r)
    return t ? [t] : []
  })
}

function handleDefault(rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  return handleV1(rawTimers)
}

const VERSION_HANDLERS: Record<number, VersionHandler> = {
  1: handleV1,
}

function parseTimers(version: number, rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  const handler = VERSION_HANDLERS[version] ?? handleDefault
  return handler(rawTimers)
}

export function exportTimers(timers: Timer[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      timers: timers.map(t => ({
        ...t,
        targetDatetime: t.targetDatetime.toISOString(),
        originalTargetDatetime: t.originalTargetDatetime.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
    null,
    2,
  )
}

export function importTimers(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file format')
  }

  const envelope = parsed as Record<string, unknown>

  if (typeof envelope.version !== 'number') {
    throw new Error('Missing version field')
  }

  if (!Array.isArray(envelope.timers)) {
    throw new Error('Missing timers array')
  }

  const rawCount = (envelope.timers as unknown[]).length
  const timers = parseTimers(envelope.version, envelope.timers as unknown[]) as Timer[]

  return {
    timers,
    skipped: rawCount - timers.length,
  }
}
