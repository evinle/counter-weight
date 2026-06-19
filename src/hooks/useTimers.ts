import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { HISTORY_STATUSES, SyncStatuses } from '../db/schema'
import type { Priority, Timer, TimerType } from '../db/schema'

export function useActiveTimers(): Timer[] {
  return (
    useLiveQuery(
      () => db.timers.where('status').equals('active').sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useFeedTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf('active', 'fired')
          .sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useHistoryTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf(...HISTORY_STATUSES)
          .toArray()
          .then((arr) =>
            arr.sort(
              (a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime(),
            ),
          ),
      [],
      [],
    ) ?? []
  )
}

export async function createTimer(
  data: Omit<
    Timer,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'originalTargetDatetime'
    | 'serverId'
    | 'userId'
    | 'syncStatus'
    | 'version'
  >,
  userId: string | null,
): Promise<number | undefined> {
  const now = new Date()
  return db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId,
    syncStatus: userId ? SyncStatuses.Pending : SyncStatuses.Synced,
    version: null,
  })
}

export async function completeTimer(id: number): Promise<void> {
  await db.timers.update(id, {
    status: 'completed',
    updatedAt: new Date(),
    syncStatus: SyncStatuses.Pending,
  })
}

export async function cancelTimer(id: number): Promise<void> {
  await db.timers.update(id, {
    status: 'cancelled',
    updatedAt: new Date(),
    syncStatus: SyncStatuses.Pending,
  })
}

export async function editTimer(
  id: number,
  params: {
    targetDatetime?: Date
    title: string
    emoji: string | null
    priority: Priority
    tagIds: string[]
    timerType?: TimerType
    leadTimeMs?: number | null
  },
) {
  const current = await db.timers.get(id)
  if (!current) return

  if (params.targetDatetime !== undefined) {
    const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime
    const isExtending = params.targetDatetime > current.targetDatetime
    if (isAlreadyExtended && isExtending) return false
  }

  const { targetDatetime, timerType, leadTimeMs, ...rest } = params
  const updates: Parameters<typeof db.timers.update>[1] = { ...rest, updatedAt: new Date(), syncStatus: 'pending' }
  if (targetDatetime !== undefined) updates.targetDatetime = targetDatetime
  if (timerType !== undefined) updates.timerType = timerType
  if (leadTimeMs !== undefined) updates.leadTimeMs = leadTimeMs

  await db.timers.update(id, updates)
}

async function getUnclaimedIds(): Promise<number[]> {
  const all = await db.timers.toArray()
  return all.filter(t => t.userId === null).map(t => t.id!)
}

export async function claimTimers(userId: string): Promise<void> {
  const ids = await getUnclaimedIds()
  await Promise.all(ids.map(id => db.timers.update(id, { userId, syncStatus: SyncStatuses.Pending, updatedAt: new Date() })))
}

export async function removeUnclaimedTimers(): Promise<void> {
  const ids = await getUnclaimedIds()
  await db.timers.bulkDelete(ids)
}

export async function startWork(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  if (!timer) return
  const hasOpenSession = timer.workSessions.some(s => s.endedAt === null)
  if (hasOpenSession) return
  await db.timers.update(id, {
    workSessions: [...timer.workSessions, { startedAt: new Date(), endedAt: null }],
    updatedAt: new Date(),
    syncStatus: SyncStatuses.Pending,
  })
}

export async function endWork(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  if (!timer) return
  const now = new Date()
  const sessions = timer.workSessions.map((s, i) =>
    i === timer.workSessions.length - 1 && s.endedAt === null
      ? { ...s, endedAt: now }
      : s
  )
  await db.timers.update(id, { workSessions: sessions, updatedAt: now, syncStatus: SyncStatuses.Pending })
}

export async function doneTask(id: number): Promise<void> {
  await endWork(id)
  await completeTimer(id)
}

export async function bulkImportTimers(timers: Omit<Timer, 'id'>[]): Promise<void> {
  await db.timers.bulkAdd(timers)
}
