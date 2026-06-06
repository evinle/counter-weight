import { TimerStatus, EventType } from "../db/schema.js";

export type SendNotification = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { serverId: string; title: string; emoji: string },
) => Promise<{ statusCode: number }>;

export type NotifyDb = {
  getTimerByServerId(serverId: string): Promise<{
    id: string;
    userId: string;
    status: TimerStatus;
    targetDatetime: Date;
    title: string;
    emoji: string | null;
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

function isGoneError(e: unknown): e is { statusCode: number } {
  return (
    typeof e === "object" &&
    e !== null &&
    "statusCode" in e &&
    typeof e.statusCode === "number"
  );
}

export async function handleTimerFired(
  payload: { serverId: string; userId: string; targetDatetime: string },
  db: NotifyDb,
  sendNotification: SendNotification,
): Promise<void> {
  const timer = await db.getTimerByServerId(payload.serverId);
  if (!timer) {
    console.error(`[notify] timer not found: ${payload.serverId}`);
    return;
  }
  if (timer.status !== TimerStatus.Active) {
    console.log(`[notify] skipping timer ${payload.serverId}, status=${timer.status}`);
    return;
  }

  const subscriptions = await db.getSubscriptionsForUser(payload.userId);
  if (subscriptions.length === 0) {
    console.log(`[notify] no subscriptions found for user ${payload.userId}`);
    return;
  }

  console.log(`[notify] sending to ${subscriptions.length} subscription(s) for user ${payload.userId}`);

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendNotification(
        {
          endpoint: sub.endpoint,
          p256dh: sub.subscription.p256dh,
          auth: sub.subscription.auth,
        },
        { serverId: timer.id, title: timer.title, emoji: timer.emoji ?? "" },
      ),
    ),
  );

  await Promise.all(
    results.map((result, i) => {
      const hint = subscriptions[i].subscription.deviceHint;
      if (result.status === "fulfilled") {
        console.log(`[notify] sent ok to ${hint} (${subscriptions[i].endpoint}) status=${result.value.statusCode}`);
      } else if (isGoneError(result.reason) && result.reason.statusCode === 410) {
        console.log(`[notify] subscription gone (410) for ${hint} (${subscriptions[i].endpoint}), deleting`);
        return db.deleteSubscription(subscriptions[i].id);
      } else {
        console.error(`[notify] failed to send to ${hint} (${subscriptions[i].endpoint}):`, result.reason);
      }
      return Promise.resolve();
    }),
  );

  await db.insertTimerEvent({
    timerId: timer.id,
    userId: payload.userId,
    eventType: EventType.Fired,
  });
}
