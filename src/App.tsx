import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useTimerStore } from "./store/timerStore";
import { FeedView } from "./components/FeedView";
import { HistoryView } from "./components/HistoryView";
import { AnalyticsView } from "./components/AnalyticsView";
import { SettingsView } from "./components/SettingsView";
import { CreateEditView } from "./components/CreateEditView";
import { BottomTabBar } from "./components/BottomTabBar";
import { ToastNotification } from "./components/ToastNotification";
import { Tab, ActiveAction } from "./lib/navigation";
import type { Timer } from "./db/schema";

export function App() {
  const [tab, setTab] = useState<Tab>(Tab.Timers);
  const [activeAction, setActiveAction] = useState<ActiveAction>(
    ActiveAction.None,
  );
  const [editTimer, setEditTimer] = useState<Timer | undefined>();
  const [swDebug, setSwDebug] = useState<string | null>(null);

  const sync = useTimerStore((s) => s.sync);
  const firedTimer = useTimerStore((s) => s.firedTimer);
  const dismissFired = useTimerStore((s) => s.dismissFired);

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
  }, [firedTimer]);

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
    <div className="h-dvh bg-slate-900 text-white max-w-lg mx-auto overscroll-none">
      {firedTimer && (
        <ToastNotification timer={firedTimer} onDismiss={dismissFired} />
      )}
      {swDebug && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
          {swDebug}
        </div>
      )}
      {notifPermission === "default" && activeAction === ActiveAction.None && (
        <div
          className="fixed left-4 right-4 z-40 bg-slate-800 border border-slate-600 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl"
          style={{ bottom: "calc(var(--bottom-tab-bar-height) + 1rem)" }}
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

      <main className="h-full box-border py-2 pb-bottom-bar">
        {renderContent()}
      </main>

      {activeAction === ActiveAction.None && (
        <BottomTabBar
          activeTab={tab}
          onTabChange={setTab}
          onCreateNew={handleCreateNew}
        />
      )}
    </div>
  );
}
