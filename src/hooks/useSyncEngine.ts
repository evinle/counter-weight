import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { isTRPCClientError } from "@trpc/client";
import { db } from "../db";
import { SyncStatuses, TimerStatuses } from "../db/schema";
import type { Timer } from "../db/schema";
import { trpc } from "../lib/trpc";
import type { AuthUser } from "./useAuth";

const LAST_SYNCED_KEY = "cw:lastSyncedAt";

// Module-level lock: survives user changes (logout → login) within the same tab.
// useRef would reset on unmount/remount, allowing overlapping sync runs.
let syncRunning = false;
let currentUser: AuthUser | null = null;

type ServerTimer = Awaited<ReturnType<typeof trpc.timers.list.query>>[number];
type ServerTag = Awaited<ReturnType<typeof trpc.tags.reconcile.query>>['tags'][number];

function mapServerTimer(s: ServerTimer) {
  return {
    serverId: s.id,
    title: s.title,
    description: s.description,
    emoji: s.emoji,
    targetDatetime: new Date(s.targetDatetime),
    originalTargetDatetime: new Date(s.originalTargetDatetime),
    status: s.status,
    priority: s.priority,
    recurrenceRule: s.recurrenceRule as { cron: string; tz: string } | null,
    version: s.version,
    tagIds: s.tagIds,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}

function mapServerTag(s: ServerTag) {
  return {
    serverId: s.id,
    name: s.name,
    color: s.color,
    emoji: s.emoji,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}

async function drainTags(user: AuthUser): Promise<void> {
  const pending = await db.tags
    .where("syncStatus")
    .equals(SyncStatuses.Pending)
    .and((t) => t.userId === user.userId)
    .toArray();

  for (const tag of pending) {
    try {
      const result = await trpc.tags.upsert.mutate({
        serverId: tag.serverId,
        name: tag.name,
        color: tag.color,
        emoji: tag.emoji,
        version: tag.version ?? undefined,
      });
      await db.tags.update(tag.id!, {
        serverId: result.serverId,
        version: result.version,
        syncStatus: SyncStatuses.Synced,
      });
    } catch (err: unknown) {
      const code = isTRPCClientError(err) ? err.data?.code : undefined;
      if (code === "CONFLICT" && tag.serverId) {
        const { tags: serverTags } = await trpc.tags.reconcile.query({
          since: null,
          records: [],
        });
        const match = serverTags.find((t) => t.id === tag.serverId);
        if (match) {
          await db.tags.update(tag.id!, {
            ...mapServerTag(match),
            syncStatus: SyncStatuses.Synced,
          });
        }
      }
      // Other errors: leave pending, retry on next sync
    }
  }
}

async function reconcileTags(user: AuthUser, since: string | null): Promise<void> {
  const localTags = await db.tags
    .where("userId")
    .equals(user.userId)
    .toArray();

  const records = since
    ? []
    : localTags
        .filter((t) => t.serverId)
        .map((t) => ({
          serverId: t.serverId!,
          updatedAt: t.updatedAt.toISOString(),
        }));

  const { tags: stale } = await trpc.tags.reconcile.query({ since, records });

  for (const serverTag of stale) {
    const local = localTags.find((t) => t.serverId === serverTag.id);
    if (local?.id !== undefined) {
      await db.tags.update(local.id, {
        ...mapServerTag(serverTag),
        userId: user.userId,
      });
    } else {
      await db.tags.add({
        ...mapServerTag(serverTag),
        userId: user.userId,
      });
    }
  }
}

async function drain(user: AuthUser) {
  if (syncRunning) return;
  syncRunning = true;
  try {
    await drainTags(user);

    const pending = await db.timers
      .where("syncStatus")
      .equals(SyncStatuses.Pending)
      .and((t) => t.userId === user.userId)
      .toArray();

    type TerminalStatus =
      | typeof TimerStatuses.Completed
      | typeof TimerStatuses.Cancelled;
    function isTerminalStatus(s: string): s is TerminalStatus {
      return s === TimerStatuses.Completed || s === TimerStatuses.Cancelled;
    }

    const terminalMutate: Record<
      TerminalStatus,
      (input: { serverId: string; version: number }) => Promise<unknown>
    > = {
      [TimerStatuses.Completed]: trpc.timers.complete.mutate,
      [TimerStatuses.Cancelled]: trpc.timers.cancel.mutate,
    };

    for (const timer of pending) {
      const terminal = isTerminalStatus(timer.status)
        ? terminalMutate[timer.status]
        : undefined;
      try {
        if (terminal) {
          if (timer.serverId && timer.version != null) {
            await terminal({
              serverId: timer.serverId,
              version: timer.version,
            });
            await db.timers.update(timer.id!, {
              syncStatus: SyncStatuses.Synced,
            });
          }
          // no serverId or version: leave pending, retry on next sync
        } else {
          const result = await trpc.timers.upsert.mutate({
            serverId: timer.serverId,
            title: timer.title,
            description: timer.description,
            emoji: timer.emoji,
            targetDatetime: timer.targetDatetime.toISOString(),
            originalTargetDatetime: timer.originalTargetDatetime.toISOString(),
            status: timer.status,
            priority: timer.priority,
            recurrenceRule: timer.recurrenceRule,
            version: timer.version ?? undefined,
            tagIds: timer.tagIds,
          });
          await db.timers.update(timer.id!, {
            serverId: result.serverId,
            syncStatus: SyncStatuses.Synced,
            version: result.version,
          });
        }
      } catch (err: unknown) {
        const code = isTRPCClientError(err) ? err.data?.code : undefined;
        if (code === "CONFLICT" && timer.serverId) {
          // Server wins: fetch the single conflicting record and overwrite Dexie
          const match = await trpc.timers.get.query({
            serverId: timer.serverId,
          });
          if (match) {
            console.warn("[conflict] overwriting local timer", {
              timerId: timer.id,
              userId: user.userId,
              localVersion: timer.version,
              serverVersion: match.version,
            });
            await db.timers.update(timer.id!, {
              ...mapServerTimer(match),
              syncStatus: SyncStatuses.Synced,
            });
          }
        }
        // Other errors: leave pending, retry on next sync
      }
    }
  } finally {
    syncRunning = false;
  }
}

async function reconcileTimers(user: AuthUser, since: string | null): Promise<string> {
  const localTimers = await db.timers
    .where("userId")
    .equals(user.userId)
    .toArray();

  const records = since
    ? []
    : localTimers
        .filter(
          (t) =>
            t.serverId &&
            (t.status === TimerStatuses.Active ||
              t.status === TimerStatuses.Fired),
        )
        .map((t) => ({
          serverId: t.serverId!,
          updatedAt: t.updatedAt.toISOString(),
        }));

  const { timers: stale, serverNow } = await trpc.timers.reconcile.query({
    since,
    records,
  });

  for (const serverTimer of stale) {
    const local = localTimers.find((t) => t.serverId === serverTimer.id);
    if (local?.id !== undefined) {
      await db.timers.update(local.id, {
        ...mapServerTimer(serverTimer),
        syncStatus: SyncStatuses.Synced,
      });
    } else {
      await db.timers.add({
        ...mapServerTimer(serverTimer),
        userId: user.userId,
        syncStatus: SyncStatuses.Synced,
      });
    }
  }

  return serverNow;
}

async function reconcile(user: AuthUser) {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY);
    await reconcileTags(user, lastSyncedAt);
    const serverNow = await reconcileTimers(user, lastSyncedAt);
    localStorage.setItem(LAST_SYNCED_KEY, serverNow);
  } finally {
    syncRunning = false;
  }
}

async function sync(user: AuthUser) {
  await drain(user);
  await reconcile(user);
}

export async function triggerSync(): Promise<void> {
  if (!currentUser) return;
  await reconcile(currentUser);
}

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  currentUser = user;

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
    drain(user);
  }, [pendingTimers, user?.userId]);

  useEffect(() => {
    if (!user) return;

    sync(user);

    function handleOnline() {
      sync(user!);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") sync(user!);
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.userId]);
}
