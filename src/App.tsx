import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useTimerStore } from "./store/timerStore";
import { FeedView } from "./components/FeedView";
import { HistoryView } from "./components/HistoryView";
import { AnalyticsView } from "./components/AnalyticsView";
import { SettingsView } from "./components/SettingsView";
import { CreateEditView } from "./components/CreateEditView";
import { BottomTabBar } from "./components/BottomTabBar";
import { ToastContainer } from "./components/ToastContainer";
import { useToast } from "./hooks/useToast";
import { Tab, ActiveAction } from "./lib/navigation";
import type { Timer } from "./db/schema";
import { useAuth } from "./hooks/useAuth";
import { LoginView } from "./components/LoginView";
import { trpc, setIdToken } from "./lib/trpc";

const queryClient = new QueryClient();

export function App() {
  const [tab, setTab] = useState<Tab>(Tab.Timers);
  const [activeAction, setActiveAction] = useState<ActiveAction>(
    ActiveAction.None,
  );
  const [editTimer, setEditTimer] = useState<Timer | undefined>();
  const [swDebug, setSwDebug] = useState<string | null>(null);

  const { state, user, login, continueAsGuest } = useAuth();

  // Handle Cognito auth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    fetch("/auth/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, origin: window.location.origin }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const { idToken } = (await res.json()) as { idToken: string };
        // Reload triggers useAuth's silent refresh, which restores authenticated state.
        // Known limitation (M2): causes a visible roundtrip. Fixing cleanly requires a
        // shared auth store so the callback can update auth state in place. Defer to M3.
        setIdToken(idToken);
        window.location.reload();
      });
  }, []);

  useEffect(() => {
    if (state !== "authenticated" || !user) return;

    function bootstrap(attempt = 0) {
      trpc.auth.bootstrap
        .mutate({ email: user!.email })
        .catch((err) => {
          console.error("[bootstrap] failed:", err);
          if (attempt < 1) setTimeout(() => bootstrap(attempt + 1), 2000);
        });
    }

    bootstrap();
  }, [state, user?.userId]);

  const sync = useTimerStore((s) => s.sync);
  const firedTimer = useTimerStore((s) => s.firedTimer);
  const dismissFired = useTimerStore((s) => s.dismissFired);
  const { show } = useToast();

  const activeTimers =
    useLiveQuery(
      () => db.timers.where("status").equals("active").toArray(),
      [],
    ) ?? [];

  useEffect(() => {
    sync(activeTimers);
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SYNC_TIMERS",
        timers: activeTimers
          .filter((t): t is typeof t & { id: number } => t.id !== undefined)
          .map((t) => ({
            id: t.id,
            title: t.title,
            emoji: t.emoji ?? undefined,
            targetDatetime: t.targetDatetime.toISOString(),
          })),
      });
    }
  }, [activeTimers]);

  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission | null>(null);

  useEffect(() => {
    if ("Notification" in window) setNotifPermission(Notification.permission);
  }, []);

  function requestNotifPermission() {
    Notification.requestPermission().then((p) => setNotifPermission(p));
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      setSwDebug(`SW ready · ${reg.scope}`);
      setTimeout(() => setSwDebug(null), 4000);
    });
  }, []);

  useEffect(() => {
    if (!firedTimer) return;
    if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(firedTimer.title, {
          body: "Timer complete",
          icon: "/icon-192.png",
          tag: String(firedTimer.id),
        });
      });
    }
    if (firedTimer.id !== undefined) {
      db.timers.update(firedTimer.id, {
        status: "fired",
        updatedAt: new Date(),
      });
    }
    show({
      message: `${firedTimer.emoji ?? "⏰"} ${firedTimer.title}`,
      position: "top",
    });
    dismissFired();
  }, [firedTimer, show, dismissFired]);

  const handleEdit = (timer: Timer) => {
    setEditTimer(timer);
    setActiveAction(ActiveAction.CreateEdit);
  };

  const handleCreateNew = () => {
    setEditTimer(undefined);
    setActiveAction(ActiveAction.CreateEdit);
  };

  const handleDone = () => {
    setActiveAction(ActiveAction.None);
    setEditTimer(undefined);
  };

  function renderContent() {
    if (state === "loading") {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
        </div>
      );
    }

    if (state === "unauthenticated") {
      return <LoginView onLogin={login} onContinueAsGuest={continueAsGuest} />;
    }

    if (activeAction === ActiveAction.CreateEdit) {
      return <CreateEditView existing={editTimer} onDone={handleDone} />;
    }
    switch (tab) {
      case Tab.Timers:
        return <FeedView onEdit={handleEdit} />;
      case Tab.History:
        return <HistoryView />;
      case Tab.Analytics:
        return <AnalyticsView />;
      case Tab.Settings:
        return <SettingsView />;
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
    <div className="h-dvh bg-slate-900 text-white max-w-lg mx-auto overscroll-none pt-safe-top">
      <ToastContainer />
      {swDebug && (
        <div className="fixed top-safe-top left-1/2 -translate-x-1/2 z-50 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
          {swDebug}
        </div>
      )}
      {notifPermission === "default" && activeAction === ActiveAction.None && (
        <div
          className="fixed left-4 right-4 z-40 bg-slate-800 border border-slate-600 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl"
          style={{ bottom: "calc(var(--spacing-bottom-bar-inset) + 1rem)" }}
        >
          <p className="text-sm text-slate-300">
            Enable notifications for timer alerts
          </p>
          <button
            onClick={requestNotifPermission}
            className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg active:scale-95 transition-all cursor-pointer"
          >
            Enable
          </button>
        </div>
      )}

      <main className="h-full box-border pb-tab-bar">{renderContent()}</main>

      {activeAction === ActiveAction.None && (state === "authenticated" || state === "guest") && (
        <BottomTabBar
          activeTab={tab}
          onTabChange={setTab}
          onCreateNew={handleCreateNew}
        />
      )}
    </div>
    </QueryClientProvider>
  );
}
