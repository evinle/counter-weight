import { TimerStatus, TimerType, EventType } from "../db/schema.js";
import type { WorkSessionJson } from "../api/routers/timers.js";
import type { PushFanout } from "./pushFanout.js";
import type { LeadEvent, DeadlineEvent, OverdueEvent } from "./events.js";
import type { NotificationScheduler } from "./notificationScheduler.js";
import { nextRung, formatOverdueBy } from "./nudgeLadder.js";

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

  await scheduleNextNudge(event.serverId, event.userId, event.deadline, deps);

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

export async function handleOverdueNudge(event: OverdueEvent, deps: NotifyDeps): Promise<void> {
  const timer = await getActiveTimer(deps.db, event.serverId);
  if (!timer) return;

  // The deadline was edited after this nudge was scheduled. The edit rescheduled the
  // timer from its new deadline, so this chain is stale: drop it.
  if (timer.targetDatetime.getTime() !== event.deadline.getTime()) {
    console.log(`[notify] dropping stale overdue nudge for ${event.serverId}: deadline changed`);
    return;
  }

  await scheduleNextNudge(event.serverId, event.userId, event.deadline, deps);

  // The user is actively working on it: skip the push, but the chain above keeps
  // running so a later nudge fires if they stop without completing.
  if (timer.timerType === TimerType.Task && timer.workSessions.some((s) => s.endedAt === null)) {
    console.log(`[notify] suppressing overdue nudge for ${event.serverId}: work session open`);
    return;
  }

  await deps.push.send(event.userId, {
    serverId: timer.id,
    title: timer.title,
    emoji: timer.emoji ?? "",
    kind: "overdue",
    overdueBy: formatOverdueBy(deps.now().getTime() - event.deadline.getTime()),
  });
}

// Schedule before sending: a crash after this leaves the chain alive, and the
// deterministic schedule name makes a retried firing idempotent.
async function scheduleNextNudge(
  serverId: string,
  userId: string,
  deadline: Date,
  deps: NotifyDeps,
): Promise<void> {
  const rung = nextRung(deps.now(), deadline);
  if (rung) {
    await deps.notifications.schedule({
      kind: "overdue",
      serverId,
      userId,
      nudgeAt: rung.at,
      deadline,
    });
  }
}
