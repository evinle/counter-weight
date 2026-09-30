import { SyncStatuses, TimerType } from './schema'
import type { SyncStatus, TimerV1, TimerV2, TimerV3, TimerV4, TimerV5, TimerV6 } from './schema'
import { legacyHexToColor } from '../lib/entityColors'

export function migrateV1toV2(timer: TimerV1): TimerV2 {
  return {
    ...timer,
    originalTargetDatetime: timer.targetDatetime,
  }
}

export function migrateV2toV3(timer: TimerV2): TimerV3 {
  return {
    ...timer,
    serverId: null,
    userId: null,
    syncStatus: 'synced',
    version: null,
  }
}

export function migrateV3toV4({ isFlagged: _f, groupId: _g, ...rest }: TimerV3): TimerV4 {
  return rest
}

export function migrateV4toV5(timer: TimerV4): TimerV5 {
  return { ...timer, tagIds: [] }
}

export function migrateV5toV6(timer: TimerV5): TimerV6 {
  return { ...timer, timerType: TimerType.Reminder, leadTimeMs: null, workSessions: [] }
}

/**
 * Tags and groups used to store a preset hex colour; they now store a colour slot name.
 * A row that already exists on the server is marked pending so the sync engine sends
 * the new value. Pending and deleted rows keep their state (a deleted row must not come back).
 */
export function migrateEntityColor<
  T extends { color: string | null; serverId: string | null; syncStatus: SyncStatus },
>(row: T): T {
  const slot = row.color === null ? undefined : legacyHexToColor(row.color)
  if (slot === undefined) return row
  const needsPush = row.syncStatus === SyncStatuses.Synced && row.serverId !== null
  return { ...row, color: slot, syncStatus: needsPush ? SyncStatuses.Pending : row.syncStatus }
}
