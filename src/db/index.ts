import Dexie, { type EntityTable } from 'dexie'
import type { Timer, Tag, Group } from './schema'
import { migrateEntityColor, migrateV1toV2, migrateV2toV3, migrateV4toV5, migrateV5toV6 } from './migrations'

class CounterWeightDB extends Dexie {
  timers!: EntityTable<Timer, 'id'>
  tags!: EntityTable<Tag, 'id'>
  groups!: EntityTable<Group, 'id'>

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
    this.version(4).stores({
      timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
    })
    this.version(5).stores({
      timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
      tags: '++id, syncStatus, userId, serverId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        Object.assign(timer, migrateV4toV5(timer))
      })
    )
    this.version(6).stores({
      timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
      tags: '++id, syncStatus, userId, serverId',
      groups: '++id, syncStatus, userId, serverId',
    })
    this.version(7).stores({
      timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
      tags: '++id, syncStatus, userId, serverId',
      groups: '++id, syncStatus, userId, serverId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        Object.assign(timer, migrateV5toV6(timer))
      })
    )
    this.version(8).stores({
      timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
      tags: '++id, syncStatus, userId, serverId',
      groups: '++id, syncStatus, userId, serverId',
    }).upgrade(async tx => {
      await tx.table('tags').toCollection().modify(tag => {
        Object.assign(tag, migrateEntityColor(tag))
      })
      await tx.table('groups').toCollection().modify(group => {
        Object.assign(group, migrateEntityColor(group))
      })
    })
  }
}

export const db = new CounterWeightDB()