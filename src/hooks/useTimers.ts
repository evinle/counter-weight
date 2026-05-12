import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Priority, Timer } from "../db/schema";
import { HISTORY_STATUSES } from "../db/schema";

export function useActiveTimers(): Timer[] {
  return (
    useLiveQuery(
      () => db.timers.where("status").equals("active").sortBy("targetDatetime"),
      [],
      [],
    ) ?? []
  );
}

export function useFeedTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where("status")
          .anyOf("active", "fired")
          .sortBy("targetDatetime"),
      [],
      [],
    ) ?? []
  );
}

export function useHistoryTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where("status")
          .anyOf(...HISTORY_STATUSES)
          .toArray()
          .then((arr) =>
            arr.sort(
              (a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime(),
            ),
          ),
      [],
      [],
    ) ?? []
  );
}

export async function createTimer(
  data: Omit<Timer, "id" | "createdAt" | "updatedAt">,
): Promise<number | undefined> {
  const now = new Date();
  return db.timers.add({ ...data, createdAt: now, updatedAt: now });
}

export async function completeTimer(id: number): Promise<void> {
  await db.timers.update(id, { status: "completed", updatedAt: new Date() });
}

export async function editTimer(
  id: number,
  params: {
    targetDatetime: Date;
    title: string;
    emoji: string | null;
    priority: Priority;
  },
) {
  await db.timers.update(id, params);
}
