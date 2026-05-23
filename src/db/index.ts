import Dexie, { type EntityTable } from 'dexie'
import type { Timer } from './schema'
import { migrateV1toV2, migrateV2toV3 } from './migrations'

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
        Object.assign(timer, migrateV1toV2(timer))
      })
    )
    this.version(3).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId, syncStatus, serverId, userId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        Object.assign(timer, migrateV2toV3(timer))
      })
    )
  }
}

export const db = new CounterWeightDB()