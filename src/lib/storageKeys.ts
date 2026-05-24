export const STORAGE_PREFIX = 'cw'
export const STORAGE_SEP = ':'

const LOCAL_STORAGE_KEYS = ['LastSyncedAt', 'Bootstrapped'] as const
export type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[number]

export const StorageKey = {
  LastSyncedAt: `${STORAGE_PREFIX}${STORAGE_SEP}lastSyncedAt`,
  Bootstrapped: `${STORAGE_PREFIX}${STORAGE_SEP}bootstrapped`,
} as const satisfies Record<LocalStorageKey, string>
export type StorageKey = typeof StorageKey[keyof typeof StorageKey]

export function bootstrappedKey(userId: string): string {
  return `${StorageKey.Bootstrapped}${STORAGE_SEP}${userId}`
}
