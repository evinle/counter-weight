import { z } from 'zod'
import { router, protectedProcedure } from '../router.js'
import { createTimerSchedules, updateTimerSchedules, deleteTimerSchedules } from '../timerScheduling.js'
import { TimerStatus, Priority, TimerType } from '../../db/schema.js'
import type { TagRecord } from './tags.js'
import type { GroupRecord } from './groups.js'
import type { TimerRecord } from './timers.js'

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

const fullSyncInput = z.object({
  since: z.string().datetime().nullable(),
  tags: z.array(tagSyncItemSchema),
  groups: z.array(groupSyncItemSchema),
  timers: z.array(timerSyncItemSchema),
})

function deduplicateById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const seen = new Set(primary.map((r) => r.id))
  return [...primary, ...secondary.filter((r) => !seen.has(r.id))]
}

export const syncRouter = router({
  full: protectedProcedure
    .input(fullSyncInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId
      const since = input.since ? new Date(input.since) : null

      const syncedTags: SyncedTagEntry[] = []
      const syncedGroups: SyncedGroupEntry[] = []
      const syncedTimers: SyncedTimerEntry[] = []
      const conflictTags: TagRecord[] = []
      const conflictGroups: GroupRecord[] = []
      const conflictTimers: TimerRecord[] = []

      // Drain tags
      const tagClientToServer = new Map<number, string>()
      for (const item of input.tags) {
        if (item.op === 'upsert') {
          if (item.serverId) {
            const updated = await ctx.tagsDb.updateTag(
              { id: item.serverId, userId, version: item.version },
              { name: item.name, color: item.color, emoji: item.emoji },
            )
            if (!updated) {
              const serverRecord = await ctx.tagsDb.getTag(item.serverId, userId)
              if (serverRecord) conflictTags.push(serverRecord)
            } else {
              tagClientToServer.set(item.clientId, updated.serverId)
              syncedTags.push({ op: 'upsert', clientId: item.clientId, serverId: updated.serverId })
            }
          } else {
            const created = await ctx.tagsDb.insertTag({ userId, name: item.name, color: item.color, emoji: item.emoji })
            tagClientToServer.set(item.clientId, created.serverId)
            syncedTags.push({ op: 'upsert', clientId: item.clientId, serverId: created.serverId })
          }
        } else {
          await ctx.tagsDb.deleteTag({ id: item.serverId, userId })
          syncedTags.push({ op: 'delete', serverId: item.serverId })
        }
      }

      // Drain groups
      for (const item of input.groups) {
        if (item.op === 'upsert') {
          if (item.serverId) {
            const updated = await ctx.groupsDb.updateGroup(
              { id: item.serverId, userId, version: item.version },
              { name: item.name, emoji: item.emoji, color: item.color, conditions: item.conditions },
            )
            if (!updated) {
              const serverRecord = await ctx.groupsDb.getGroup(item.serverId, userId)
              if (serverRecord) conflictGroups.push(serverRecord)
            } else {
              syncedGroups.push({ op: 'upsert', clientId: item.clientId, serverId: updated.serverId })
            }
          } else {
            const created = await ctx.groupsDb.insertGroup({ userId, name: item.name, emoji: item.emoji, color: item.color, conditions: item.conditions })
            syncedGroups.push({ op: 'upsert', clientId: item.clientId, serverId: created.serverId })
          }
        } else {
          await ctx.groupsDb.deleteGroup({ id: item.serverId, userId })
          syncedGroups.push({ op: 'delete', serverId: item.serverId })
        }
      }

      // Drain timers
      for (const item of input.timers) {
        if (item.op === 'upsert') {
          const resolvedTagIds = item.tagIds.map((ref) => {
            if (ref.serverId) return ref.serverId
            return tagClientToServer.get(ref.clientId) ?? null
          }).filter((id): id is string => id !== null)

          if (item.serverId) {
            const updated = await ctx.timersDb.updateTimer(
              { id: item.serverId, userId, version: item.version },
              {
                title: item.title,
                description: item.description,
                emoji: item.emoji,
                targetDatetime: new Date(item.targetDatetime),
                status: item.status,
                priority: item.priority,
                recurrenceRule: item.recurrenceRule,
                tagIds: resolvedTagIds,
                timerType: item.timerType,
                leadTimeMs: item.leadTimeMs,
                workSessions: item.workSessions,
              },
            )
            if (!updated) {
              const serverRecord = await ctx.timersDb.getTimer(item.serverId, userId)
              if (serverRecord) conflictTimers.push(serverRecord)
            } else {
              await updateTimerSchedules(item.serverId, new Date(item.targetDatetime), item.leadTimeMs, ctx)
              syncedTimers.push({ op: 'upsert', clientId: item.clientId, serverId: updated.serverId })
            }
          } else {
            const created = await ctx.timersDb.insertTimer({
              userId,
              title: item.title,
              description: item.description,
              emoji: item.emoji,
              targetDatetime: new Date(item.targetDatetime),
              originalTargetDatetime: new Date(item.originalTargetDatetime),
              status: item.status,
              priority: item.priority,
              recurrenceRule: item.recurrenceRule,
              tagIds: resolvedTagIds,
              timerType: item.timerType,
              leadTimeMs: item.leadTimeMs,
              workSessions: item.workSessions,
            })
            await createTimerSchedules(created.serverId, new Date(item.targetDatetime), item.leadTimeMs, ctx)
            syncedTimers.push({ op: 'upsert', clientId: item.clientId, serverId: created.serverId })
          }
        } else {
          const updated = await ctx.timersDb.setStatus(
            { id: item.serverId, userId, version: item.version },
            item.op === 'complete' ? 'completed' : 'cancelled',
          )
          if (updated) {
            await deleteTimerSchedules(item.serverId, ctx.scheduler)
            syncedTimers.push({ op: item.op, clientId: item.clientId, serverId: item.serverId })
          } else {
            const serverRecord = await ctx.timersDb.getTimer(item.serverId, userId)
            if (serverRecord) conflictTimers.push(serverRecord)
          }
        }
      }

      // Reconcile all three types
      const [reconciledTags, reconciledGroups, reconciledTimers] = await Promise.all([
        ctx.tagsDb.reconcile(userId, since),
        ctx.groupsDb.reconcile(userId, since),
        ctx.timersDb.reconcile(userId, since),
      ])

      const serverNow = new Date().toISOString()

      return {
        synced: {
          tags: syncedTags,
          groups: syncedGroups,
          timers: syncedTimers,
        },
        overruled: {
          tags: deduplicateById(reconciledTags, conflictTags),
          groups: deduplicateById(reconciledGroups, conflictGroups),
          timers: deduplicateById(reconciledTimers, conflictTimers),
        },
        serverNow,
      }
    }),
})
