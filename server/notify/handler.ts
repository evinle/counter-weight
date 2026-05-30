import { TimerStatus, EventType } from "../db/schema.js";

export type SendNotification = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string },
) => Promise<{ statusCode: number }>;

export type NotifyDb = {
  getTimerByServerId(serverId: string): Promise<{
    id: string;
    userId: string;
    status: TimerStatus;
    targetDatetime: Date;
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
  if (!timer || timer.status !== TimerStatus.Active) return;

  const subscriptions = await db.getSubscriptionsForUser(payload.userId);

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendNotification(
        {
          endpoint: sub.endpoint,
          p256dh: sub.subscription.p256dh,
          auth: sub.subscription.auth,
        },
        { title: "Timer fired", body: `Timer ${payload.serverId} has fired` },
      ),
    ),
  );

  await Promise.all(
    results.map((result, i) => {
      if (result.status === "rejected" && isGoneError(result.reason) && result.reason.statusCode === 410) {
        return db.deleteSubscription(subscriptions[i].id);
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
