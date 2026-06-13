import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { isTRPCClientError } from "@trpc/client";
import { db } from "../db";
import { SyncStatuses, TimerStatuses } from "../db/schema";
import type { SyncStatus, Tag, Timer } from "../db/schema";
import { trpc } from "../lib/trpc";
import type { AuthUser } from "./useAuth";

const LAST_SYNCED_KEY = "cw:lastSyncedAt";

let syncRunning = false;
let currentUser: AuthUser | null = null;

type ServerTimer = Awaited<ReturnType<typeof trpc.timers.list.query>>[number];
type ServerTag = Awaited<ReturnType<typeof trpc.tags.reconcile.query>>["tags"][number];

type RecordRef = { serverId: string; updatedAt: string };

type LocalBase = {
  id?: number;
  serverId: string | null;
  syncStatus: SyncStatus;
  version: number | null;
};

interface SyncAdapter<TLocal extends LocalBase, TServer extends { id: string }> {
  label: string;
  getPending: (userId: string) => Promise<TLocal[]>;
  getLocalItems: (userId: string) => Promise<TLocal[]>;
  buildRefs: (since: string | null, items: TLocal[]) => RecordRef[];
  drain: (entity: TLocal) => Promise<{ serverId: string; version: number } | null>;
  getConflictRecord: (serverId: string) => Promise<TServer | null>;
  getServerRecords: (
    since: string | null,
    refs: RecordRef[],
  ) => Promise<{ records: TServer[]; serverNow?: string }>;
  mapToLocal: (server: TServer, userId: string) => Omit<TLocal, "id">;
  // Accepts Partial<LocalBase> so generic helpers can pass sync-status patches without casts.
  updateLocal: (id: number, patch: Partial<LocalBase> | Omit<TLocal, "id">) => Promise<void>;
  addLocal: (record: Omit<TLocal, "id">) => Promise<void>;
  logConflict?: (entity: TLocal, server: TServer, userId: string) => void;
}

function mapServerTimer(s: ServerTimer): Omit<Timer, "id"> {
  return {
    serverId: s.id,
    userId: null,
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

function mapServerTag(s: ServerTag): Omit<Tag, "id"> {
  return {
    serverId: s.id,
    userId: null,
    name: s.name,
    color: s.color,
    emoji: s.emoji,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}

const tagAdapter: SyncAdapter<Tag, ServerTag> = {
  label: "tag",

  getPending: (userId) =>
    db.tags
      .where("syncStatus")
      .equals(SyncStatuses.Pending)
      .and((t) => t.userId === userId)
      .toArray(),

  getLocalItems: (userId) => db.tags.where("userId").equals(userId).toArray(),

  buildRefs: (since, items) =>
    since
      ? []
      : items
          .filter((t) => t.serverId)
          .map((t) => ({ serverId: t.serverId!, updatedAt: t.updatedAt.toISOString() })),

  drain: async (tag) => {
    const result = await trpc.tags.upsert.mutate({
      serverId: tag.serverId,
      name: tag.name,
      color: tag.color,
      emoji: tag.emoji,
      version: tag.version ?? undefined,
    });
    return { serverId: result.serverId, version: result.version };
  },

  getConflictRecord: async (serverId) => {
    const { tags } = await trpc.tags.reconcile.query({ since: null, records: [] });
    return tags.find((t) => t.id === serverId) ?? null;
  },

  getServerRecords: async (since, refs) => {
    const { tags, serverNow } = await trpc.tags.reconcile.query({ since, records: refs });
    return { records: tags, serverNow };
  },

  mapToLocal: (s, userId) => ({ ...mapServerTag(s), userId }),

  updateLocal: (id, patch) => db.tags.update(id, patch).then(() => {}),

  addLocal: (record) => db.tags.add(record as Tag).then(() => {}),
};

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

const timerAdapter: SyncAdapter<Timer, ServerTimer> = {
  label: "timer",

  getPending: (userId) =>
    db.timers
      .where("syncStatus")
      .equals(SyncStatuses.Pending)
      .and((t) => t.userId === userId)
      .toArray(),

  getLocalItems: (userId) => db.timers.where("userId").equals(userId).toArray(),

  buildRefs: (since, items) =>
    since
      ? []
      : items
          .filter(
            (t) =>
              t.serverId &&
              (t.status === TimerStatuses.Active || t.status === TimerStatuses.Fired),
          )
          .map((t) => ({ serverId: t.serverId!, updatedAt: t.updatedAt.toISOString() })),

  drain: async (timer) => {
    if (isTerminalStatus(timer.status)) {
      if (!timer.serverId || timer.version == null) return null;
      await terminalMutate[timer.status]({ serverId: timer.serverId, version: timer.version });
      return { serverId: timer.serverId, version: timer.version };
    }
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
    return { serverId: result.serverId, version: result.version };
  },

  getConflictRecord: (serverId) => trpc.timers.get.query({ serverId }),

  getServerRecords: async (since, refs) => {
    const { timers, serverNow } = await trpc.timers.reconcile.query({ since, records: refs });
    return { records: timers, serverNow };
  },

  mapToLocal: (s, userId) => ({ ...mapServerTimer(s), userId }),

  updateLocal: (id, patch) => db.timers.update(id, patch).then(() => {}),

  addLocal: (record) =>
    db.timers.add({ ...(record as Timer), syncStatus: SyncStatuses.Synced }).then(() => {}),

  logConflict: (timer, match, userId) => {
    console.warn("[conflict] overwriting local timer", {
      timerId: timer.id,
      userId,
      localVersion: timer.version,
      serverVersion: match.version,
    });
  },
};

// --- Generic loop helpers ---
// Inside these functions TLocal/TServer are concrete, so the correlated-unions
// problem that affects heterogeneous arrays doesn't apply.

async function drainAdapter<TLocal extends LocalBase, TServer extends { id: string }>(
  adapter: SyncAdapter<TLocal, TServer>,
  user: AuthUser,
): Promise<void> {
  const pending = await adapter.getPending(user.userId);
  for (const item of pending) {
    try {
      const result = await adapter.drain(item);
      if (result) {
        await adapter.updateLocal(item.id!, {
          serverId: result.serverId,
          version: result.version,
          syncStatus: SyncStatuses.Synced,
        });
      }
    } catch (err: unknown) {
      const code = isTRPCClientError(err) ? err.data?.code : undefined;
      if (code === "CONFLICT" && item.serverId) {
        const server = await adapter.getConflictRecord(item.serverId);
        if (server) {
          adapter.logConflict?.(item, server, user.userId);
          await adapter.updateLocal(item.id!, adapter.mapToLocal(server, user.userId));
        }
      }
      // Other errors: leave pending, retry on next sync
    }
  }
}

async function reconcileAdapter<TLocal extends LocalBase, TServer extends { id: string }>(
  adapter: SyncAdapter<TLocal, TServer>,
  since: string | null,
  user: AuthUser,
): Promise<string | undefined> {
  const localItems = await adapter.getLocalItems(user.userId);
  const refs = adapter.buildRefs(since, localItems);
  const { records: serverRecords, serverNow } = await adapter.getServerRecords(since, refs);

  for (const server of serverRecords) {
    const local = localItems.find((t) => t.serverId === server.id);
    const data = adapter.mapToLocal(server, user.userId);
    if (local?.id !== undefined) {
      await adapter.updateLocal(local.id, data);
    } else {
      await adapter.addLocal(data);
    }
  }

  return serverNow;
}

// wrapAdapter erases TLocal/TServer via closure so the pipeline can be a plain array.
interface AdapterStep {
  drain: (user: AuthUser) => Promise<void>;
  reconcile: (since: string | null, user: AuthUser) => Promise<string | undefined>;
}

function wrapAdapter<TLocal extends LocalBase, TServer extends { id: string }>(
  adapter: SyncAdapter<TLocal, TServer>,
): AdapterStep {
  return {
    drain: (user) => drainAdapter(adapter, user),
    reconcile: (since, user) => reconcileAdapter(adapter, since, user),
  };
}

// Single source of adapter ordering. Add one line here when a new table needs sync.
const PIPELINE: AdapterStep[] = [
  wrapAdapter(tagAdapter),
  wrapAdapter(timerAdapter),
];

async function drainAll(user: AuthUser) {
  if (syncRunning) return;
  syncRunning = true;
  try {
    for (const step of PIPELINE) await step.drain(user);
  } finally {
    syncRunning = false;
  }
}

async function reconcileAll(user: AuthUser) {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const since = localStorage.getItem(LAST_SYNCED_KEY);
    let latestServerNow: string | undefined;
    for (const step of PIPELINE) {
      latestServerNow = (await step.reconcile(since, user)) ?? latestServerNow;
    }
    if (latestServerNow) localStorage.setItem(LAST_SYNCED_KEY, latestServerNow);
  } finally {
    syncRunning = false;
  }
}

async function sync(user: AuthUser) {
  await drainAll(user);
  await reconcileAll(user);
}

export async function triggerSync(): Promise<void> {
  if (!currentUser) return;
  await reconcileAll(currentUser);
}

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  useEffect(() => {
    currentUser = user;
  }, [user]);

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
    drainAll(user);
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
