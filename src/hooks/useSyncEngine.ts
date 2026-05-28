import { useEffect } from "react";
import { db } from "../db";
import { trpc } from "../lib/trpc";
import type { AuthUser } from "./useAuth";

const LAST_SYNCED_KEY = "cw:lastSyncedAt";

// Module-level lock: survives user changes (logout → login) within the same tab.
// useRef would reset on unmount/remount, allowing overlapping sync runs.
let syncRunning = false;

type ServerTimer = Awaited<ReturnType<typeof trpc.timers.list.query>>[number];

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
    isFlagged: s.isFlagged,
    recurrenceRule: s.recurrenceRule as { cron: string; tz: string } | null,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    groupId: null,
    syncStatus: "synced" as const,
  };
}

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  useEffect(() => {
    if (!user) return;

    async function drainPending(validUser: AuthUser) {
      const pending = await db.timers
        .where("syncStatus")
        .equals("pending")
        .and((t) => t.userId === validUser.userId)
        .toArray();

      for (const timer of pending) {
        try {
          const result = await trpc.timers.upsert.mutate({
            serverId: timer.serverId,
            title: timer.title,
            description: timer.description,
            emoji: timer.emoji,
            targetDatetime: timer.targetDatetime.toISOString(),
            originalTargetDatetime: timer.originalTargetDatetime.toISOString(),
            status: timer.status,
            priority: timer.priority,
            isFlagged: timer.isFlagged,
            recurrenceRule: timer.recurrenceRule,
            version: timer.version ?? undefined,
          });
          await db.timers.update(timer.id!, {
            serverId: result.serverId,
            syncStatus: "synced",
            version: result.version,
          });
        } catch (err: unknown) {
          const code = (err as { data?: { code?: string } })?.data?.code;
          if (code === "CONFLICT" && timer.serverId) {
            // Server wins: fetch the single conflicting record and overwrite Dexie
            const match = await trpc.timers.get.query({
              serverId: timer.serverId,
            });
            if (match) {
              console.warn("[conflict] overwriting local timer", {
                timerId: timer.id,
                userId: validUser.userId,
                localVersion: timer.version,
                serverVersion: match.version,
              });
              await db.timers.update(timer.id!, {
                ...mapServerTimer(match),
                syncStatus: "synced",
              });
            }
          }
          // Other errors: leave pending, retry on next sync
        }
      }
    }

    async function reconcile(validUser: AuthUser) {
      const lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY);
      const localTimers = await db.timers
        .where("userId")
        .equals(validUser.userId)
        .toArray();

      const records = localTimers
        .filter((t) => t.serverId)
        .map((t) => ({
          serverId: t.serverId!,
          updatedAt: t.updatedAt.toISOString(),
        }));

      const stale = await trpc.timers.reconcile.query({
        since: lastSyncedAt,
        records,
      });

      for (const serverTimer of stale) {
        const local = localTimers.find((t) => t.serverId === serverTimer.id);
        if (local?.id !== undefined) {
          await db.timers.update(local.id, {
            ...mapServerTimer(serverTimer),
            syncStatus: "synced",
          });
        } else {
          await db.timers.add({
            ...mapServerTimer(serverTimer),
            userId: validUser.userId,
            syncStatus: "synced",
          });
        }
      }

      localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
    }

    async function sync(validUser: AuthUser) {
      if (syncRunning) return;
      syncRunning = true;
      try {
        await drainPending(validUser);
        await reconcile(validUser);
      } finally {
        syncRunning = false;
      }
    }

    sync(user);

    function onOnline(validUser: AuthUser) {
      sync(validUser);
    }
    function onVisibility(validUser: AuthUser) {
      if (document.visibilityState === "visible") sync(validUser);
    }

    window.addEventListener("online", () => onOnline(user));
    document.addEventListener("visibilitychange", () => onVisibility(user));

    return () => {
      window.removeEventListener("online", () => onOnline(user));
      document.removeEventListener("visibilitychange", () =>
        onVisibility(user),
      );
    };
  }, [user?.userId]);
}
