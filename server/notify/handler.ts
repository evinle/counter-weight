import { TimerStatus, EventType } from "../db/schema.js";
import type { TimerType } from "../db/schema.js";
import type { WorkSessionJson } from "../api/routers/timers.js";
import type { PushFanout } from "./pushFanout.js";
import type { LeadEvent, DeadlineEvent } from "./events.js";
import type { NotificationScheduler } from "./notificationScheduler.js";
import { nextRung } from "./nudgeLadder.js";

export type { SendNotification } from "./pushFanout.js";

export type NotifyDb = {
  getTimerByServerId(serverId: string): Promise<{
    id: string;
    userId: string;
    status: TimerStatus;
    targetDatetime: Date;
    title: string;
    emoji: string | null;
    timerType: TimerType;
    workSessions: WorkSessionJson[];
  } | null>;
  getSubscriptionsForUser(userId: string): Promise<
    Array<{
      id: string;
      userId: string;
      endpoint: string;
      subscription: { p256dh: string; auth: string; deviceHint: string };
    }>
  >;
  deleteSubscription(id: string): Promise<void>;
  insertTimerEvent(event: {
    timerId: string;
    userId: string;
    eventType: EventType;
  }): Promise<void>;
};

export type NotifyDeps = {
  db: NotifyDb;
  push: PushFanout;
  notifications: NotificationScheduler;
  now: () => Date;
};

async function getActiveTimer(db: NotifyDb, serverId: string) {
  const timer = await db.getTimerByServerId(serverId);
  if (!timer) {
    console.error(`[notify] timer not found: ${serverId}`);
    return null;
  }
  if (timer.status !== TimerStatus.Active) {
    console.log(`[notify] skipping timer ${serverId}, status=${timer.status}`);
    return null;
  }
  return timer;
}

export async function handleLead(event: LeadEvent, deps: NotifyDeps): Promise<void> {
  const timer = await getActiveTimer(deps.db, event.serverId);
  if (!timer) return;

  await deps.push.send(event.userId, {
    serverId: timer.id,
    title: `Reminder: ${timer.title}`,
    emoji: timer.emoji ?? "",
    kind: "lead",
  });
}

export async function handleDeadline(event: DeadlineEvent, deps: NotifyDeps): Promise<void> {
  const timer = await getActiveTimer(deps.db, event.serverId);
  if (!timer) return;

  // Schedule before sending: a crash after this leaves the chain alive, and the
  // deterministic schedule name makes a retried firing idempotent.
  const rung = nextRung(deps.now(), event.deadline);
  if (rung) {
    await deps.notifications.schedule({
      kind: "overdue",
      serverId: event.serverId,
      userId: event.userId,
      nudgeAt: rung.at,
      deadline: event.deadline,
    });
  }

  const { attempted } = await deps.push.send(event.userId, {
    serverId: timer.id,
    title: timer.title,
    emoji: timer.emoji ?? "",
    kind: "deadline",
  });

  if (attempted > 0) {
    await deps.db.insertTimerEvent({
      timerId: timer.id,
      userId: event.userId,
      eventType: EventType.Fired,
    });
  }
}
