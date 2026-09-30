export const SyncTrigger = {
  Manual: 'manual',
  PendingWrite: 'pending-write',
  Login: 'login',
  Online: 'online',
  Visible: 'visible',
} as const satisfies Record<string, string>
export type SyncTrigger = typeof SyncTrigger[keyof typeof SyncTrigger]
export function isSyncTrigger(v: unknown): v is SyncTrigger {
  return Object.values(SyncTrigger).includes(v as SyncTrigger)
}
