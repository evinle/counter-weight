import type { TimerV1, TimerV2, TimerV3, TimerV4 } from './schema'

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
