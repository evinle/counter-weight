import Dexie, { type EntityTable } from 'dexie'
import type { Timer } from './schema'

class CounterWeightDB extends Dexie {
  timers!: EntityTable<Timer, 'id'>

  constructor() {
    super('counter-weight')
    this.version(1).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    })
  }
}

export const db = new CounterWeightDB()