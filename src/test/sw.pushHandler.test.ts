import { describe, it, expect, beforeEach } from "vitest";
import { createPushHandler } from "../sw.pushHandler";
import { createNotifyTimer } from "../sw.notify";
import { NotifyKind } from "../sw.scheduler";
import type { SyncTimerEntry } from "../sw.scheduler";
import { createFakeNotificationTray } from "./fakes/notificationTray";

let tray: ReturnType<typeof createFakeNotificationTray>;
let handlePush: ReturnType<typeof createPushHandler>;

beforeEach(() => {
  tray = createFakeNotificationTray();
  handlePush = createPushHandler({
    registration: tray.registration,
    hasVisibleClient: async () => false,
  });
});

function deadlinePush(serverId = "timer-1", title = "Standup") {
  return { serverId, title, emoji: "", kind: "deadline" };
}

describe("createPushHandler", () => {
  it("shows a deadline push as a notification in the timer's slot", async () => {
    // Arrange
    const data = { ...deadlinePush(), emoji: "⏰" };

    // Act
    await handlePush(data);

    // Assert
    expect(tray.open).toEqual([
      {
        title: "⏰ Standup",
        body: "Time's up",
        tag: "timer-1",
        renotify: true,
        data: { kind: "deadline" },
      },
    ]);
  });

  it("replaces the timer's earlier notification with the newer one", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's up" });

    // Act
    await handlePush({ ...deadlinePush(), kind: "overdue", overdueBy: "15m" });

    // Assert
    expect(tray.open).toEqual([
      {
        title: "Standup",
        body: "Overdue by 15m",
        tag: "timer-1",
        renotify: true,
        data: { kind: "overdue" },
      },
    ]);
  });
});

describe("createPushHandler (separate slots and best-effort clean-up)", () => {
  it("keeps a separate notification for each timer", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1" });

    // Act
    await handlePush(deadlinePush("timer-2", "Laundry"));

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["timer-1", "timer-2"]);
  });

  it("still shows the notification when the tray cannot be read", async () => {
    // Arrange
    tray.failReads();

    // Act
    await handlePush(deadlinePush());

    // Assert
    expect(tray.open.map((entry) => entry.title)).toEqual(["Standup"]);
  });
});

describe("createPushHandler (a notification that will not close)", () => {
  it("still shows the new notification and closes the rest of the old ones", async () => {
    // Arrange
    tray.seed({ title: "Stuck", tag: "timer-1" });
    tray.seed({ title: "Stale", tag: "timer-1" });
    tray.makeUnclosable("Stuck");

    // Act
    await handlePush(deadlinePush());

    // Assert
    expect(tray.open.map((entry) => entry.title)).toEqual(["Stuck", "Standup"]);
  });
});

describe("createPushHandler (guards and failures)", () => {
  it("shows nothing for a payload it cannot parse", async () => {
    // Act
    await handlePush({ title: "no server id" });

    // Assert
    expect(tray.open).toEqual([]);
  });

  it("shows nothing while an app window is visible", async () => {
    // Arrange
    const handle = createPushHandler({
      registration: tray.registration,
      hasVisibleClient: async () => true,
    });

    // Act
    await handle(deadlinePush());

    // Assert
    expect(tray.open).toEqual([]);
  });

  it("keeps the earlier notification and surfaces the error when showing fails", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's almost up" });
    const handle = createPushHandler({
      registration: {
        ...tray.registration,
        showNotification: async () => {
          throw new Error("show failed");
        },
      },
      hasVisibleClient: async () => false,
    });

    // Act
    const result = handle(deadlinePush());

    // Assert
    await expect(result).rejects.toThrow("show failed");
    expect(tray.open.map((entry) => entry.body)).toEqual(["Time's almost up"]);
  });
});

describe("createPushHandler (the event is already in the slot)", () => {
  it("does not show a deadline again when the slot already holds one", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's up", data: { kind: "deadline" } });

    // Act
    await handlePush(deadlinePush());

    // Assert
    expect(tray.open).toEqual([
      {
        title: "Standup",
        body: "Time's up",
        tag: "timer-1",
        renotify: undefined,
        data: { kind: "deadline" },
      },
    ]);
  });
});

describe("createPushHandler (which events replace what)", () => {
  it("does not show a lead again when the slot already holds one", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's almost up", data: { kind: "lead" } });

    // Act
    await handlePush({ ...deadlinePush(), kind: "lead" });

    // Assert
    expect(tray.open.map((entry) => entry.renotify)).toEqual([undefined]);
  });

  it("shows the deadline over a lead that is already in the slot", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's almost up", data: { kind: "lead" } });

    // Act
    await handlePush(deadlinePush());

    // Assert
    expect(tray.open.map((entry) => entry.body)).toEqual(["Time's up"]);
  });

  it("shows every overdue nudge, replacing the previous one", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Overdue by 15m", data: { kind: "overdue" } });

    // Act
    await handlePush({ ...deadlinePush(), kind: "overdue", overdueBy: "1h" });

    // Assert
    expect(tray.open.map((entry) => entry.body)).toEqual(["Overdue by 1h"]);
  });

  it.each([
    ["no stored data", undefined],
    ["a stored kind it does not recognise", { kind: "snooze" }],
    ["stored data that is not an object", "deadline"],
  ])("shows the deadline when the notification in the slot has %s", async (_label, data) => {
    // Arrange
    tray.seed({ title: "Standup", tag: "timer-1", body: "Time's up", data });

    // Act
    await handlePush(deadlinePush());

    // Assert
    expect(tray.open.map((entry) => entry.renotify)).toEqual([true]);
  });
});

describe("createPushHandler (events in flight together)", () => {
  it("leaves one notification when a push and the on-device deadline land together", async () => {
    // Arrange
    const notifyTimer = createNotifyTimer({ registration: tray.registration });
    const timer = {
      id: 1,
      serverId: "timer-1",
      title: "Standup",
      emoji: undefined,
      targetDatetime: "2026-06-07T09:00:00.000Z",
      leadTimeMs: null,
    } satisfies SyncTimerEntry;

    // Act
    await Promise.all([handlePush(deadlinePush()), notifyTimer(timer, NotifyKind.Deadline)]);

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["timer-1"]);
  });
});

describe("createPushHandler (the per-slot queue)", () => {
  it("leaves one notification when the same push arrives twice together", async () => {
    // Act
    await Promise.all([handlePush(deadlinePush()), handlePush(deadlinePush())]);

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["timer-1"]);
  });

  it("still handles the next push after one failed to show", async () => {
    // Arrange
    let failNext = true;
    const handle = createPushHandler({
      registration: {
        ...tray.registration,
        showNotification: async (title, options) => {
          if (failNext) {
            failNext = false;
            throw new Error("show failed");
          }
          await tray.registration.showNotification(title, options);
        },
      },
      hasVisibleClient: async () => false,
    });
    const failed = handle(deadlinePush()).catch(() => "failed");

    // Act
    await handle({ ...deadlinePush(), kind: "overdue", overdueBy: "15m" });

    // Assert
    expect(await failed).toBe("failed");
    expect(tray.open.map((entry) => entry.body)).toEqual(["Overdue by 15m"]);
  });

  it("does not make one timer's notification wait for another's", async () => {
    // Arrange
    const handle = createPushHandler({
      registration: {
        ...tray.registration,
        showNotification: (title, options) =>
          options?.tag === "stuck-slot"
            ? new Promise<void>(() => {}) // never settles
            : tray.registration.showNotification(title, options),
      },
      hasVisibleClient: async () => false,
    });
    // Own slot names: the stuck call never settles, so its queue entry stays behind.
    void handle(deadlinePush("stuck-slot", "Stuck"));

    // Act
    await handle(deadlinePush("free-slot", "Laundry"));

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["free-slot"]);
  });
});
