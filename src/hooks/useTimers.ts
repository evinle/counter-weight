import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Timer } from '../db/schema'

export function useActiveTimers(): Timer[] {
  return useLiveQuery(
    () => db.timers.where('status').equals('active').sortBy('targetDatetime'),
    [],
    []
  ) ?? []
}

export async function createTimer(
  data: Omit<Timer, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number | undefined> {
  const now = new Date()
  return db.timers.add({ ...data, createdAt: now, updatedAt: now })
}

export async function completeTimer(id: number): Promise<void> {
  await db.timers.update(id, { status: 'completed', updatedAt: new Date() })
}

export async function rescheduleTimer(id: number, targetDatetime: Date): Promise<void> {
  await db.timers.update(id, { targetDatetime, updatedAt: new Date() })
}
