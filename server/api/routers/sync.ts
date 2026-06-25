import { z } from 'zod'
import { router, protectedProcedure } from '../router.js'
import { createTimerSchedules, updateTimerSchedules, deleteTimerSchedules } from '../timerScheduling.js'
import { TimerStatus, Priority, TimerType } from '../../db/schema.js'
import type { SchedulingCtx } from '../timerScheduling.js'
import type { TagsDb, TagRecord } from './tags.js'
import type { GroupsDb, GroupRecord } from './groups.js'
import type { TimersDb, TimerRecord } from './timers.js'

// ─── Output entry types ───────────────────────────────────────────────────────

type SyncedTagEntry =
  | { op: 'upsert'; clientId: number; serverId: string }
  | { op: 'delete'; serverId: string }

type SyncedGroupEntry =
  | { op: 'upsert'; clientId: number; serverId: string }
  | { op: 'delete'; serverId: string }

type SyncedTimerEntry =
  | { op: 'upsert'; clientId: number; serverId: string }
  | { op: 'complete'; clientId: number; serverId: string }
  | { op: 'cancel'; clientId: number; serverId: string }
  | { op: 'delete'; serverId: string }

// ─── Input schemas ────────────────────────────────────────────────────────────

const tagSyncItemSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('upsert'),
    clientId: z.number().int(),
    serverId: z.string().uuid().nullable(),
    name: z.string().min(1),
    color: z.string().nullable(),
    emoji: z.string().nullable(),
    version: z.number().int().optional(),
  }),
  z.object({
    op: z.literal('delete'),
    clientId: z.number().int(),
    serverId: z.string().uuid(),
  }),
])

const groupSyncItemSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('upsert'),
    clientId: z.number().int(),
    serverId: z.string().uuid().nullable(),
    name: z.string().min(1),
    emoji: z.string().nullable(),
    color: z.string().nullable(),
    conditions: z.object({
      op: z.literal('AND'),
      conditions: z.array(z.any()),
    }),
    version: z.number().int().optional(),
  }),
  z.object({
    op: z.literal('delete'),
    clientId: z.number().int(),
    serverId: z.string().uuid(),
  }),
])

const tagIdRefSchema = z.object({
  clientId: z.number().int(),
  serverId: z.string().uuid().nullable(),
})

const workSessionJsonSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
})

const timerSyncItemSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('upsert'),
    clientId: z.number().int(),
    serverId: z.string().uuid().nullable(),
    tagIds: z.array(tagIdRefSchema),
    title: z.string().min(1),
    description: z.string().nullable(),
    emoji: z.string().nullable(),
    targetDatetime: z.string().datetime(),
    originalTargetDatetime: z.string().datetime(),
    status: z.enum([TimerStatus.Active, TimerStatus.Fired, TimerStatus.Completed, TimerStatus.Missed, TimerStatus.Cancelled]),
    priority: z.enum([Priority.Low, Priority.Medium, Priority.High, Priority.Critical]),
    recurrenceRule: z.object({ cron: z.string(), tz: z.string() }).nullable(),
    timerType: z.enum([TimerType.Reminder, TimerType.Task]),
    leadTimeMs: z.number().int().nonnegative().nullable(),
    workSessions: z.array(workSessionJsonSchema).default([]),
    version: z.number().int().optional(),
  }),
  z.object({
    op: z.literal('complete'),
    clientId: z.number().int(),
    serverId: z.string().uuid(),
    version: z.number().int(),
  }),
  z.object({
    op: z.literal('cancel'),
    clientId: z.number().int(),
    serverId: z.string().uuid(),
    version: z.number().int(),
  }),
])

export const fullSyncInput = z.object({
  since: z.string().datetime().nullable(),
  tags: z.array(tagSyncItemSchema),
  groups: z.array(groupSyncItemSchema),
  timers: z.array(timerSyncItemSchema),
})

type TagSyncItem = z.infer<typeof tagSyncItemSchema>
type GroupSyncItem = z.infer<typeof groupSyncItemSchema>
type TimerSyncItem = z.infer<typeof timerSyncItemSchema>
type TagIdRef = z.infer<typeof tagIdRefSchema>

// ─── Per-item handlers ────────────────────────────────────────────────────────

type ItemResult<TSynced, TRecord> = {
  synced: TSynced | null
  conflict: TRecord | null
}

async function applyTagItem(
  item: TagSyncItem,
  userId: string,
  tagsDb: TagsDb,
  clientToServer: Map<number, string>,
): Promise<ItemResult<SyncedTagEntry, TagRecord>> {
  if (item.op === 'delete') {
    await tagsDb.deleteTag({ id: item.serverId, userId })
    return { synced: { op: 'delete', serverId: item.serverId }, conflict: null }
  }

  if (!item.serverId) {
    const created = await tagsDb.insertTag({ userId, name: item.name, color: item.color, emoji: item.emoji })
    clientToServer.set(item.clientId, created.serverId)
    return { synced: { op: 'upsert', clientId: item.clientId, serverId: created.serverId }, conflict: null }
  }

  const updated = await tagsDb.updateTag(
    { id: item.serverId, userId, version: item.version },
    { name: item.name, color: item.color, emoji: item.emoji },
  )
  if (!updated) {
    return { synced: null, conflict: await tagsDb.getTag(item.serverId, userId) }
  }

  clientToServer.set(item.clientId, updated.serverId)
  return { synced: { op: 'upsert', clientId: item.clientId, serverId: updated.serverId }, conflict: null }
}

async function applyGroupItem(
  item: GroupSyncItem,
  userId: string,
  groupsDb: GroupsDb,
): Promise<ItemResult<SyncedGroupEntry, GroupRecord>> {
  if (item.op === 'delete') {
    await groupsDb.deleteGroup({ id: item.serverId, userId })
    return { synced: { op: 'delete', serverId: item.serverId }, conflict: null }
  }

  if (!item.serverId) {
    const created = await groupsDb.insertGroup({ userId, name: item.name, emoji: item.emoji, color: item.color, conditions: item.conditions })
    return { synced: { op: 'upsert', clientId: item.clientId, serverId: created.serverId }, conflict: null }
  }

  const updated = await groupsDb.updateGroup(
    { id: item.serverId, userId, version: item.version },
    { name: item.name, emoji: item.emoji, color: item.color, conditions: item.conditions },
  )
  if (!updated) {
    return { synced: null, conflict: await groupsDb.getGroup(item.serverId, userId) }
  }

  return { synced: { op: 'upsert', clientId: item.clientId, serverId: updated.serverId }, conflict: null }
}

function resolveTagIds(refs: TagIdRef[], tagClientToServer: Map<number, string>): string[] {
  return refs
    .map((ref) => ref.serverId ?? tagClientToServer.get(ref.clientId) ?? null)
    .filter((id): id is string => id !== null)
}

async function applyTimerItem(
  item: TimerSyncItem,
  userId: string,
  timersDb: TimersDb,
  tagClientToServer: Map<number, string>,
  ctx: SchedulingCtx,
): Promise<ItemResult<SyncedTimerEntry, TimerRecord>> {
  if (item.op === 'complete' || item.op === 'cancel') {
    const status = item.op === 'complete' ? TimerStatus.Completed : TimerStatus.Cancelled
    const updated = await timersDb.setStatus({ id: item.serverId, userId, version: item.version }, status)
    if (!updated) {
      return { synced: null, conflict: await timersDb.getTimer(item.serverId, userId) }
    }
    await deleteTimerSchedules(item.serverId, ctx.scheduler)
    return { synced: { op: item.op, clientId: item.clientId, serverId: item.serverId }, conflict: null }
  }

  if (!item.serverId) {
    const created = await timersDb.insertTimer({
      userId,
      title: item.title,
      description: item.description,
      emoji: item.emoji,
      targetDatetime: new Date(item.targetDatetime),
      originalTargetDatetime: new Date(item.originalTargetDatetime),
      status: item.status,
      priority: item.priority,
      recurrenceRule: item.recurrenceRule,
      tagIds: resolveTagIds(item.tagIds, tagClientToServer),
      timerType: item.timerType,
      leadTimeMs: item.leadTimeMs,
      workSessions: item.workSessions,
    })
    await createTimerSchedules(created.serverId, new Date(item.targetDatetime), item.leadTimeMs, ctx)
    return { synced: { op: 'upsert', clientId: item.clientId, serverId: created.serverId }, conflict: null }
  }

  const updated = await timersDb.updateTimer(
    { id: item.serverId, userId, version: item.version },
    {
      title: item.title,
      description: item.description,
      emoji: item.emoji,
      targetDatetime: new Date(item.targetDatetime),
      status: item.status,
      priority: item.priority,
      recurrenceRule: item.recurrenceRule,
      tagIds: resolveTagIds(item.tagIds, tagClientToServer),
      timerType: item.timerType,
      leadTimeMs: item.leadTimeMs,
      workSessions: item.workSessions,
    },
  )
  if (!updated) {
    return { synced: null, conflict: await timersDb.getTimer(item.serverId, userId) }
  }

  await updateTimerSchedules(item.serverId, new Date(item.targetDatetime), item.leadTimeMs, ctx)
  return { synced: { op: 'upsert', clientId: item.clientId, serverId: updated.serverId }, conflict: null }
}

// ─── Drain loops ──────────────────────────────────────────────────────────────

type TagDrainResult = { synced: SyncedTagEntry[]; conflicts: TagRecord[]; clientToServer: Map<number, string> }
type GroupDrainResult = { synced: SyncedGroupEntry[]; conflicts: GroupRecord[] }
type TimerDrainResult = { synced: SyncedTimerEntry[]; conflicts: TimerRecord[] }

async function drainTags(items: TagSyncItem[], userId: string, tagsDb: TagsDb): Promise<TagDrainResult> {
  const synced: SyncedTagEntry[] = []
  const conflicts: TagRecord[] = []
  const clientToServer = new Map<number, string>()
  for (const item of items) {
    const result = await applyTagItem(item, userId, tagsDb, clientToServer)
    if (result.synced) synced.push(result.synced)
    if (result.conflict) conflicts.push(result.conflict)
  }
  return { synced, conflicts, clientToServer }
}

async function drainGroups(items: GroupSyncItem[], userId: string, groupsDb: GroupsDb): Promise<GroupDrainResult> {
  const synced: SyncedGroupEntry[] = []
  const conflicts: GroupRecord[] = []
  for (const item of items) {
    const result = await applyGroupItem(item, userId, groupsDb)
    if (result.synced) synced.push(result.synced)
    if (result.conflict) conflicts.push(result.conflict)
  }
  return { synced, conflicts }
}

async function drainTimers(
  items: TimerSyncItem[],
  userId: string,
  timersDb: TimersDb,
  tagClientToServer: Map<number, string>,
  ctx: SchedulingCtx,
): Promise<TimerDrainResult> {
  const synced: SyncedTimerEntry[] = []
  const conflicts: TimerRecord[] = []
  for (const item of items) {
    const result = await applyTimerItem(item, userId, timersDb, tagClientToServer, ctx)
    if (result.synced) synced.push(result.synced)
    if (result.conflict) conflicts.push(result.conflict)
  }
  return { synced, conflicts }
}

function deduplicateById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const seen = new Set(primary.map((r) => r.id))
  return [...primary, ...secondary.filter((r) => !seen.has(r.id))]
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const syncRouter = router({
  full: protectedProcedure
    .input(fullSyncInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId
      const since = input.since ? new Date(input.since) : null

      const { synced: syncedTags, conflicts: conflictTags, clientToServer: tagClientToServer } =
        await drainTags(input.tags, userId, ctx.tagsDb)

      const { synced: syncedGroups, conflicts: conflictGroups } =
        await drainGroups(input.groups, userId, ctx.groupsDb)

      const { synced: syncedTimers, conflicts: conflictTimers } =
        await drainTimers(input.timers, userId, ctx.timersDb, tagClientToServer, ctx)

      const [reconciledTags, reconciledGroups, reconciledTimers] = await Promise.all([
        ctx.tagsDb.reconcile(userId, since),
        ctx.groupsDb.reconcile(userId, since),
        ctx.timersDb.reconcile(userId, since),
      ])

      return {
        synced: { tags: syncedTags, groups: syncedGroups, timers: syncedTimers },
        overruled: {
          tags: deduplicateById(reconciledTags, conflictTags),
          groups: deduplicateById(reconciledGroups, conflictGroups),
          timers: deduplicateById(reconciledTimers, conflictTimers),
        },
        serverNow: new Date().toISOString(),
      }
    }),
})
