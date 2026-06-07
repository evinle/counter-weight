import { useCallback, useEffect, useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useTimerStore } from "../store/timerStore.js";
import { useToast } from "./useToast.js";
import type { AuthUser } from "./useAuth.js";

async function subscribeAndRegister(): Promise<void> {
  const vapidKey: string = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("VITE_VAPID_PUBLIC_KEY is not defined");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  });
  const json = subscription.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("PushSubscription is missing required fields");
  }
  await trpc.pushSubscriptions.register.mutate({
    endpoint: json.endpoint,
    p256dh,
    auth,
  });
}

type UseNotificationsResult = {
  permission: NotificationPermission;
  requestPermission: () => void;
};

export function useNotifications({
  user,
}: {
  user: AuthUser | null;
}): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    "Notification" in window ? Notification.permission : "denied",
  );

  useEffect(() => {
    if (!user) {
      console.warn("No user, skipping notifications registration");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn("No service worker, skipping notifications registration");
      return;
    }
    if (permission !== "granted") {
      console.warn(
        "Notifications not allowed, skipping notifications registration",
      );
      return;
    }

    subscribeAndRegister()
      .then(() => console.log("[useNotifications] Successfully registered"))
      .catch((err) => console.error("[useNotifications]", err));
  }, [user, permission]);

  const firedTimer = useTimerStore((s) => s.firedTimer);
  const dismissFired = useTimerStore((s) => s.dismissFired);
  const { show } = useToast();

  useEffect(() => {
    if (!firedTimer) return;
    if (permission !== "granted") {
      show({
        message: `${firedTimer.emoji ?? "⏰"} ${firedTimer.title}`,
        position: "top",
      });
    }
    dismissFired();
  }, [firedTimer, permission, show, dismissFired]);

  const requestPermission = useCallback(() => {
    Notification.requestPermission()
      .then(setPermission)
      .catch((err) => console.error("[useNotifications]", err));
  }, []);

  return { permission, requestPermission };
}
