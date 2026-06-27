import { SyncStatuses } from "../db/schema";
import type { Timer, Tag, Group } from "../db/schema";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/api/index";

type RouterOutput = inferRouterOutputs<AppRouter>;
type SyncFullOutput = RouterOutput["sync"]["full"];

export type ServerTagRecord = SyncFullOutput["overruled"]["tags"][number];
export type ServerGroupRecord = SyncFullOutput["overruled"]["groups"][number];
export type ServerTimerRecord = SyncFullOutput["overruled"]["timers"][number];

export function mapServerTag(
  s: ServerTagRecord,
  userId: string,
): Omit<Tag, "id"> {
  return {
    serverId: s.id,
    userId,
    name: s.name,
    color: s.color,
    emoji: s.emoji,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}

export function mapServerGroup(
  s: ServerGroupRecord,
  userId: string,
): Omit<Group, "id"> {
  return {
    serverId: s.id,
    userId,
    name: s.name,
    emoji: s.emoji,
    color: s.color,
    conditions: s.conditions,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}

export function mapServerTimer(
  s: ServerTimerRecord,
  userId: string,
): Omit<Timer, "id"> {
  return {
    serverId: s.id,
    userId,
    title: s.title,
    description: s.description,
    emoji: s.emoji,
    targetDatetime: new Date(s.targetDatetime),
    originalTargetDatetime: new Date(s.originalTargetDatetime),
    status: s.status,
    priority: s.priority,
    recurrenceRule: s.recurrenceRule,
    version: s.version,
    tagIds: s.tagIds,
    timerType: s.timerType,
    leadTimeMs: s.leadTimeMs,
    workSessions: (s.workSessions ?? []).map((ws) => ({
      startedAt: new Date(ws.startedAt),
      endedAt: ws.endedAt ? new Date(ws.endedAt) : null,
    })),
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    syncStatus: SyncStatuses.Synced,
  };
}
