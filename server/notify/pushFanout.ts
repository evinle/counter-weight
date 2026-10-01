// What the service worker receives. `kind` picks the notification copy client-side;
// `overdueBy` (e.g. "1h 20m") is only present for overdue nudges.
export type PushPayload = {
  serverId: string;
  title: string;
  emoji: string;
  kind: "lead" | "deadline" | "overdue";
  overdueBy?: string;
};

export type SendNotification = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
) => Promise<{ statusCode: number }>;

export type PushSubscriptionStore = {
  getSubscriptionsForUser(userId: string): Promise<
    Array<{
      id: string;
      endpoint: string;
      subscription: { p256dh: string; auth: string; deviceHint: string };
    }>
  >;
  deleteSubscription(id: string): Promise<void>;
};

export type PushFanout = {
  send(userId: string, payload: PushPayload): Promise<{ attempted: number }>;
};

function isGoneError(e: unknown): e is { statusCode: number } {
  return (
    typeof e === "object" &&
    e !== null &&
    "statusCode" in e &&
    typeof e.statusCode === "number"
  );
}

export function createPushFanout(
  store: PushSubscriptionStore,
  sendNotification: SendNotification,
): PushFanout {
  return {
    async send(userId, payload) {
      const subscriptions = await store.getSubscriptionsForUser(userId);
      if (subscriptions.length === 0) {
        console.log(`[notify] no subscriptions found for user ${userId}`);
        return { attempted: 0 };
      }

      console.log(`[notify] sending to ${subscriptions.length} subscription(s) for user ${userId}`);

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          sendNotification(
            {
              endpoint: sub.endpoint,
              p256dh: sub.subscription.p256dh,
              auth: sub.subscription.auth,
            },
            payload,
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
            return store.deleteSubscription(subscriptions[i].id);
          } else {
            console.error(`[notify] failed to send to ${hint} (${subscriptions[i].endpoint}):`, result.reason);
          }
          return Promise.resolve();
        }),
      );

      return { attempted: subscriptions.length };
    },
  };
}
