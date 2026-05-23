import Dexie, { type EntityTable } from 'dexie'
import type { Timer } from './schema'

class CounterWeightDB extends Dexie {
  timers!: EntityTable<Timer, 'id'>

  constructor() {
    super('counter-weight')
    this.version(1).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    })
    this.version(2).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        timer.originalTargetDatetime = timer.targetDatetime
      })
    )
    this.version(3).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId, syncStatus, serverId, userId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        timer.serverId = timer.serverId ?? null
        timer.userId = timer.userId ?? null
        timer.syncStatus = timer.syncStatus ?? 'synced'
        timer.version = timer.version ?? null
      })
    )
  }
}

export const db = new CounterWeightDB()