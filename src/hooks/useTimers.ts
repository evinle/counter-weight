import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Priority, Timer } from '../db/schema'
import { HISTORY_STATUSES } from '../db/schema'
import { trpc } from '../lib/trpc'

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
  const id = await db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId,
    syncStatus: userId ? 'pending' : 'synced',
    version: null,
  })

  if (userId && id !== undefined) {
    // TODO(M3): generate a clientId UUID before this write and send it with the upsert
    // so the server can deduplicate if the app crashes between server create and the
    // Dexie update below. Without it, drainPending re-sends serverId:null and creates
    // a duplicate. Low frequency but worth fixing when adding M3 server events.
    // Concurrent server sync — don't block the UI
    trpc.timers.upsert
      .mutate({
        serverId: null,
        title: data.title,
        description: data.description,
        emoji: data.emoji,
        targetDatetime: data.targetDatetime.toISOString(),
        originalTargetDatetime: data.targetDatetime.toISOString(),
        status: data.status,
        priority: data.priority,
        isFlagged: data.isFlagged,
        recurrenceRule: data.recurrenceRule,
      })
      .then((result) => {
        db.timers.update(id, {
          serverId: result.serverId,
          syncStatus: 'synced',
          version: result.version,
        })
      })
      .catch(() => {
        // Stays pending — useSyncEngine drains on reconnect
      })
  }

  return id
}

export async function completeTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'completed', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.complete
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    // Timer is offline-created (no serverId) or partially synced — mark pending
    // so drainPending will upsert the final status to the server once it syncs.
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function cancelTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'cancelled', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.cancel
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function editTimer(
  id: number,
  params: {
    targetDatetime: Date
    title: string
    emoji: string | null
    priority: Priority
  },
) {
  const current = await db.timers.get(id)
  if (!current) return

  const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime
  const isExtending = params.targetDatetime > current.targetDatetime

  if (isAlreadyExtended && isExtending) return

  const isReschedule = params.targetDatetime.getTime() !== current.targetDatetime.getTime()
  await db.timers.update(id, { ...params, updatedAt: new Date() })

  if (isReschedule && current.serverId && current.version !== null) {
    // Reschedule is critical — sync concurrently
    trpc.timers.upsert
      .mutate({
        serverId: current.serverId,
        title: params.title,
        description: current.description,
        emoji: params.emoji,
        targetDatetime: params.targetDatetime.toISOString(),
        originalTargetDatetime: current.originalTargetDatetime.toISOString(),
        status: current.status,
        priority: params.priority,
        isFlagged: current.isFlagged,
        recurrenceRule: current.recurrenceRule,
        version: current.version,
      })
      .then((r) => db.timers.update(id, { syncStatus: 'synced', version: r.version }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    // Title/emoji/priority change — deferred sync
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function bulkImportTimers(timers: Omit<Timer, 'id'>[]): Promise<void> {
  await db.timers.bulkAdd(timers)
}
