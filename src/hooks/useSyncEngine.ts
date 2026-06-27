import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect } from "react";
import { db } from "../db";
import { SyncStatuses, TimerStatuses } from "../db/schema";
import type { Timer, Tag, Group } from "../db/schema";
import { trpcReact } from "../lib/trpc";
import { mapServerTag, mapServerGroup, mapServerTimer } from "../lib/syncMappers";
import type { ServerTagRecord, ServerGroupRecord, ServerTimerRecord } from "../lib/syncMappers";
import type { AuthUser } from "./useAuth";

const LAST_SYNCED_KEY = "cw:lastSyncedAt";

// ─── Input builder ────────────────────────────────────────────────────────────

async function buildSyncInput(user: AuthUser) {
  const since = localStorage.getItem(LAST_SYNCED_KEY);

  // Tags: pending upserts + pending deletes
  const [pendingTags, deletedTags] = await Promise.all([
    db.tags.where("syncStatus").equals(SyncStatuses.Pending).and((t) => t.userId === user.userId).toArray(),
    db.tags.where("syncStatus").equals(SyncStatuses.Deleted).and((t) => t.userId === user.userId).toArray(),
  ]);

  const tags = [
    ...pendingTags.map((t) => ({
      op: "upsert" as const,
      clientId: t.id!,
      serverId: t.serverId,
      name: t.name,
      color: t.color,
      emoji: t.emoji,
      version: t.version ?? undefined,
    })),
    ...deletedTags
      .filter((t) => t.serverId)
      .map((t) => ({
        op: "delete" as const,
        clientId: t.id!,
        serverId: t.serverId!,
      })),
  ];

  // Groups: pending upserts + pending deletes
  const [pendingGroups, deletedGroups] = await Promise.all([
    db.groups.where("syncStatus").equals(SyncStatuses.Pending).and((g) => g.userId === user.userId).toArray(),
    db.groups.where("syncStatus").equals(SyncStatuses.Deleted).and((g) => g.userId === user.userId).toArray(),
  ]);

  const groups = [
    ...pendingGroups.map((g) => ({
      op: "upsert" as const,
      clientId: g.id!,
      serverId: g.serverId,
      name: g.name,
      emoji: g.emoji,
      color: g.color,
      conditions: g.conditions,
      version: g.version ?? undefined,
    })),
    ...deletedGroups
      .filter((g) => g.serverId)
      .map((g) => ({
        op: "delete" as const,
        clientId: g.id!,
        serverId: g.serverId!,
      })),
  ];

  // Timers: pending upserts, completes, and cancels (no timer delete op in sync.full)
  const pendingTimers = await db.timers
    .where("syncStatus")
    .equals(SyncStatuses.Pending)
    .and((t) => t.userId === user.userId)
    .toArray();

  // For tagIds refs: look up Dexie clientId for each serverId
  const allLocalTags = await db.tags.where("userId").equals(user.userId).toArray();
  const tagByServerId = new Map(allLocalTags.filter((t) => t.serverId).map((t) => [t.serverId!, t]));

  const timers = pendingTimers.flatMap((t) => {
    if (t.status === TimerStatuses.Completed) {
      if (!t.serverId || t.version == null) return [];
      return [{ op: "complete" as const, clientId: t.id!, serverId: t.serverId, version: t.version }];
    }
    if (t.status === TimerStatuses.Cancelled) {
      if (!t.serverId || t.version == null) return [];
      return [{ op: "cancel" as const, clientId: t.id!, serverId: t.serverId, version: t.version }];
    }
    return [{
      op: "upsert" as const,
      clientId: t.id!,
      serverId: t.serverId,
      tagIds: t.tagIds.flatMap((serverId) => {
        const tag = tagByServerId.get(serverId);
        if (!tag || tag.id === undefined) return [];
        return [{ clientId: tag.id, serverId: tag.serverId }];
      }),
      title: t.title,
      description: t.description,
      emoji: t.emoji,
      targetDatetime: t.targetDatetime.toISOString(),
      originalTargetDatetime: t.originalTargetDatetime.toISOString(),
      status: t.status,
      priority: t.priority,
      recurrenceRule: t.recurrenceRule,
      version: t.version ?? undefined,
      timerType: t.timerType,
      leadTimeMs: t.leadTimeMs,
      workSessions: t.workSessions.map((ws) => ({
        startedAt: ws.startedAt.toISOString(),
        endedAt: ws.endedAt?.toISOString() ?? null,
      })),
    }];
  });

  return { since, tags, groups, timers };
}

// ─── Write-back ───────────────────────────────────────────────────────────────

type SyncedEntry =
  | { op: "upsert" | "complete" | "cancel"; clientId: number; serverId: string }
  | { op: "delete"; serverId: string };

type SyncResult = {
  synced: { tags: SyncedEntry[]; groups: SyncedEntry[]; timers: SyncedEntry[] };
  overruled: { tags: ServerTagRecord[]; groups: ServerGroupRecord[]; timers: ServerTimerRecord[] };
  serverNow: string;
};

async function applySync(result: SyncResult, userId: string) {
  // Pass 1: apply synced entries (mark drained items as synced, hard-delete confirmed deletes)
  for (const entry of result.synced.tags) {
    if (entry.op === "delete") {
      const local = await db.tags.where("serverId").equals(entry.serverId).first();
      if (local?.id !== undefined) await db.tags.delete(local.id);
    } else {
      await db.tags.update(entry.clientId, { serverId: entry.serverId, syncStatus: SyncStatuses.Synced });
    }
  }
  for (const entry of result.synced.groups) {
    if (entry.op === "delete") {
      const local = await db.groups.where("serverId").equals(entry.serverId).first();
      if (local?.id !== undefined) await db.groups.delete(local.id);
    } else {
      await db.groups.update(entry.clientId, { serverId: entry.serverId, syncStatus: SyncStatuses.Synced });
    }
  }
  for (const entry of result.synced.timers) {
    if (entry.op === "delete") {
      const local = await db.timers.where("serverId").equals(entry.serverId).first();
      if (local?.id !== undefined) await db.timers.delete(local.id);
    } else {
      await db.timers.update(entry.clientId, { serverId: entry.serverId, syncStatus: SyncStatuses.Synced });
    }
  }

  // Pass 2: upsert overruled records (server wins — covers conflicts + stale reconcile)
  for (const record of result.overruled.tags) {
    const local = await db.tags.where("serverId").equals(record.id).first();
    const data = mapServerTag(record, userId);
    if (local?.id !== undefined) {
      await db.tags.update(local.id, data);
    } else {
      await db.tags.add(data as Tag);
    }
  }
  for (const record of result.overruled.groups) {
    const local = await db.groups.where("serverId").equals(record.id).first();
    const data = mapServerGroup(record, userId);
    if (local?.id !== undefined) {
      await db.groups.update(local.id, data);
    } else {
      await db.groups.add(data as Group);
    }
  }
  for (const record of result.overruled.timers) {
    const local = await db.timers.where("serverId").equals(record.id).first();
    const data = mapServerTimer(record, userId);
    if (local?.id !== undefined) {
      await db.timers.update(local.id, data);
    } else {
      await db.timers.add({ ...(data as Timer), syncStatus: SyncStatuses.Synced });
    }
  }

  localStorage.setItem(LAST_SYNCED_KEY, result.serverNow);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  const mutation = trpcReact.sync.full.useMutation();

  const runSync = useCallback(
    async (u: AuthUser) => {
      if (mutation.isPending) return;
      const input = await buildSyncInput(u);
      const result = await mutation.mutateAsync(input as Parameters<typeof mutation.mutateAsync>[0]);
      await applySync(result as unknown as SyncResult, u.userId);
    },
    [mutation],
  );

  const pendingTimers = useLiveQuery(
    (): Promise<Timer[]> =>
      user
        ? db.timers
            .where("syncStatus")
            .equals(SyncStatuses.Pending)
            .and((t) => t.userId === user.userId)
            .toArray()
        : Promise.resolve([]),
    [user?.userId],
    [],
  );

  useEffect(() => {
    if (!user || !pendingTimers.length) return;
    runSync(user);
  }, [pendingTimers, user?.userId]);

  useEffect(() => {
    if (!user) return;

    runSync(user);

    function handleOnline() {
      runSync(user!);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") runSync(user!);
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.userId]);

  return {
    syncing: mutation.isPending,
    triggerSync: async () => {
      if (!user) return;
      await runSync(user);
    },
  };
}
