export const STORAGE_PREFIX = 'cw'
export const STORAGE_SEP = ':'

const LOCAL_STORAGE_KEYS = ['LastSyncedAt', 'Bootstrapped', 'LastUser', 'SortMode', 'SortDirection'] as const
export type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[number]

export const StorageKey = {
  LastSyncedAt: `${STORAGE_PREFIX}${STORAGE_SEP}lastSyncedAt`,
  Bootstrapped: `${STORAGE_PREFIX}${STORAGE_SEP}bootstrapped`,
  LastUser: `${STORAGE_PREFIX}${STORAGE_SEP}lastUser`,
  SortMode: `${STORAGE_PREFIX}${STORAGE_SEP}sortMode`,
  SortDirection: `${STORAGE_PREFIX}${STORAGE_SEP}sortDirection`,
} as const satisfies Record<LocalStorageKey, string>
export type StorageKey = typeof StorageKey[keyof typeof StorageKey]

export function bootstrappedKey(userId: string): string {
  return `${StorageKey.Bootstrapped}${STORAGE_SEP}${userId}`
}

export interface LastUser {
  userId: string
  firstName: string
}

export function isLastUser(v: unknown): v is LastUser {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as LastUser).userId === 'string' &&
    typeof (v as LastUser).firstName === 'string'
  )
}

export function readLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(StorageKey.LastUser)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isLastUser(parsed) ? parsed : null
  } catch {
    return null
  }
}
