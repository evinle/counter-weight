import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useTimerStore } from "./store/timerStore";
import { FeedView } from "./components/FeedView";
import { HistoryView } from "./components/HistoryView";
import { AnalyticsView } from "./components/AnalyticsView";
import { SettingsView } from "./components/SettingsView";
import { CreateEditView } from "./components/CreateEditView";
import { GroupCreateEditView } from "./components/GroupCreateEditView";
import { GroupListView } from "./components/GroupListView";
import { BottomTabBar } from "./components/BottomTabBar";
import { ToastContainer } from "./components/ToastContainer";
import { Tab, ActiveAction } from "./lib/navigation";
import type { Group, Timer } from "./db/schema";
import { useAuth } from "./hooks/useAuth";
import { useSyncEngine } from "./hooks/useSyncEngine";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { useSwipeBack } from "./hooks/useSwipeBack";
import { useTabSwipe } from "./hooks/useTabSwipe";
import { ALL_TABS } from "./lib/navigation";
import { useNotifications } from "./hooks/useNotifications";
import { LoginView } from "./components/LoginView";
import { UnclaimedTimersModal } from "./components/UnclaimedTimersModal";
import { claimTimers, removeUnclaimedTimers } from "./hooks/useTimers";
import { trpc } from "./lib/trpc";
import { fetchFromBackend } from "./lib/api";
import { bootstrappedKey } from "./lib/storageKeys";
import { useAuthStore, subscribeToAuthPersistence } from "./store/authStore";


export function App() {
  const [tab, setTab] = useState<Tab>(Tab.Timers);
  const [activeAction, setActiveAction] = useState<ActiveAction>(
    ActiveAction.None,
  );
  const [editTimer, setEditTimer] = useState<Timer | undefined>();
  const [editGroup, setEditGroup] = useState<Group | undefined>();
  const [swDebug, setSwDebug] = useState<string | null>(null);

  const { state, user } = useAuth();
  const { syncing, triggerSync } = useSyncEngine({ user });
  const overlayOpen = activeAction !== ActiveAction.None;
  const pullEnabled = !overlayOpen && tab !== Tab.Settings;
  const { containerRef: pullRef, pullDistance } = usePullToRefresh({
    onRefresh: pullEnabled && user ? triggerSync : null,
  });
  const { containerRef: tabSwipeRef } = useTabSwipe({
    tabs: ALL_TABS,
    activeTab: tab,
    onTabChange: (t) => setTab(t as Tab),
  });
  useSwipeBack({
    isOpen: overlayOpen,
    onClose: () => setActiveAction(ActiveAction.None),
  });
  const containerRef = (el: HTMLElement | null) => {
    pullRef(el);
    tabSwipeRef(el);
  };

  const [unclaimedDismissed, setUnclaimedDismissed] = useState(false);
  useEffect(() => {
    setUnclaimedDismissed(false);
  }, [user?.userId]);
  const unclaimedCount =
    useLiveQuery(
      async () => {
        const all = await db.timers.toArray();
        return all.filter((t) => t.userId === null).length;
      },
      [],
      0,
    ) ?? 0;

  const showUnclaimedModal =
    state === "authenticated" && unclaimedCount > 0 && !unclaimedDismissed;

  useEffect(() => {
    const unsubscribe = subscribeToAuthPersistence();
    useAuthStore.getState().bootstrap();
    return unsubscribe;
  }, []);

  // Handle Cognito auth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (!code && !error) return;

    window.history.replaceState({}, "", "/");

    if (error) {
      useAuthStore.getState().setUnauthenticated();
      return;
    }

    if (code) {
      fetchFromBackend("/auth/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, origin: window.location.origin }),
      }).then(async (res) => {
        if (!res.ok) {
          useAuthStore.getState().setUnauthenticated();
          return;
        }
        const { idToken } = (await res.json()) as { idToken: string };
        useAuthStore.getState().setAuthenticated(idToken);
      });
    }
  }, []);

  useEffect(() => {
    if (state !== "authenticated" || !user) return;

    const key = bootstrappedKey(user.userId);
    if (localStorage.getItem(key)) return;

    function bootstrap(attempt = 0) {
      trpc.auth.bootstrap
        .mutate({ email: user!.email })
        .then(() => localStorage.setItem(key, "1"))
        .catch((err) => {
          console.error("[bootstrap] failed:", err);
          if (attempt < 1) setTimeout(() => bootstrap(attempt + 1), 2000);
        });
    }

    bootstrap();
  }, [state, user?.userId]);

  const sync = useTimerStore((s) => s.sync);

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
            serverId: t.serverId,
            title: t.title,
            emoji: t.emoji ?? undefined,
            targetDatetime: t.targetDatetime.toISOString(),
            leadTimeMs: t.leadTimeMs,
          })),
      });
    }
  }, [activeTimers]);

  const {
    permission: notifPermission,
    requestPermission: requestNotifPermission,
  } = useNotifications({ user: user ?? null });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      setSwDebug(`SW ready · ${reg.scope}`);
      setTimeout(() => setSwDebug(null), 4000);
    });
  }, []);

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
    setEditGroup(undefined);
  };

  const handleEditGroup = (group: import("./db/schema").Group) => {
    setEditGroup(group);
    setActiveAction(ActiveAction.CreateEditGroup);
  };

  const handleCreateNewGroup = () => {
    setEditGroup(undefined);
    setActiveAction(ActiveAction.CreateEditGroup);
  };

  const handleManageGroups = () => {
    setActiveAction(ActiveAction.ManageGroups);
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
      return <LoginView />;
    }

    if (activeAction === ActiveAction.CreateEdit) {
      return (
        <CreateEditView
          existing={editTimer}
          onDone={handleDone}
          userId={user?.userId ?? null}
        />
      );
    }

    if (activeAction === ActiveAction.CreateEditGroup) {
      return (
        <GroupCreateEditView
          existing={editGroup}
          onDone={handleDone}
          onCancel={handleManageGroups}
          userId={user?.userId ?? null}
        />
      );
    }

    if (activeAction === ActiveAction.ManageGroups) {
      return (
        <GroupListView
          userId={user?.userId ?? null}
          onEdit={handleEditGroup}
          onCreateNew={handleCreateNewGroup}
          onDone={handleDone}
        />
      );
    }

    switch (tab) {
      case Tab.Timers:
        return (
          <FeedView
            onEdit={handleEdit}
            onManageGroups={handleManageGroups}
            userId={user?.userId ?? null}
          />
        );
      case Tab.History:
        return <HistoryView />;
      case Tab.Analytics:
        return <AnalyticsView />;
      case Tab.Settings:
        return <SettingsView />;
    }
  }

  return (
    <div
        ref={containerRef}
        className="relative h-dvh bg-slate-900 text-white max-w-lg mx-auto overscroll-none pt-safe-top"
      >
        {(pullDistance > 0 || syncing) && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-50 w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shadow-lg"
            style={{
              top:
                syncing && pullDistance === 0
                  ? "calc(env(safe-area-inset-top) + 24px)"
                  : `${pullDistance - 8}px`,
              transition: pullDistance === 0 ? "top 0.15s ease-out" : "none",
            }}
          >
            {syncing ? (
              <div className="w-5 h-5 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" />
            ) : (
              <span className="text-slate-300 text-sm leading-none">↓</span>
            )}
          </div>
        )}
        <ToastContainer />
        {swDebug && (
          <div className="fixed top-safe-top left-1/2 -translate-x-1/2 z-50 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
            {swDebug}
          </div>
        )}
        {notifPermission === "default" &&
          activeAction === ActiveAction.None &&
          state === "authenticated" && (
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

        {showUnclaimedModal && (
          <UnclaimedTimersModal
            count={unclaimedCount}
            onSync={async () => {
              await claimTimers(user!.userId);
              setUnclaimedDismissed(true);
            }}
            onKeep={() => setUnclaimedDismissed(true)}
            onRemove={async () => {
              await removeUnclaimedTimers();
              setUnclaimedDismissed(true);
            }}
          />
        )}

        {activeAction === ActiveAction.None &&
          (state === "authenticated" || state === "guest") && (
            <BottomTabBar
              activeTab={tab}
              onTabChange={setTab}
              onCreateNew={handleCreateNew}
            />
          )}
      </div>
  );
}
