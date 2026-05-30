export function shouldSuppressPush(
  serverId: string,
  firedSet: Set<string>,
  hasVisibleClient: boolean,
): boolean {
  return firedSet.has(serverId) || hasVisibleClient
}
