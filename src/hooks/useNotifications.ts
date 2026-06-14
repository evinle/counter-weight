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
    // status.state uses 'prompt' where NotificationPermission uses 'default'
    const fromStatusState = (state: PermissionState): NotificationPermission =>
      state === "prompt" ? "default" : state;

    const syncFromNotification = () => {
      if ("Notification" in window) setPermission(Notification.permission);
    };

    let cleanup: (() => void) | undefined;

    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "notifications" })
        .then((status) => {
          setPermission(fromStatusState(status.state));
          const onChange = () => setPermission(fromStatusState(status.state));
          status.addEventListener("change", onChange);
          cleanup = () => status.removeEventListener("change", onChange);
        })
        .catch(() =>
          console.warn(
            "[useNotifications] failed to query notifications status change",
          ),
        );
    }

    // Fallback for Safari, which doesn't support permissions.query for notifications
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncFromNotification();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cleanup?.();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
      .then(() => {
        console.log("[useNotifications] Successfully registered");
        setPermission(
          "Notification" in window ? Notification.permission : "denied",
        );
      })
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
