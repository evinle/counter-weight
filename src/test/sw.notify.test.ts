import { describe, it, expect, beforeEach } from "vitest";
import { createNotifyTimer } from "../sw.notify";
import { NotifyKind } from "../sw.scheduler";
import type { SyncTimerEntry } from "../sw.scheduler";
import { createFakeNotificationTray } from "./fakes/notificationTray";

const SYNCED_TIMER = {
  id: 1,
  serverId: "3189b62d-87b4-4768-aa58-81f30c6c02d3",
  title: "Standup",
  emoji: undefined,
  targetDatetime: "2026-06-07T09:00:00.000Z",
  leadTimeMs: null,
} satisfies SyncTimerEntry;

let tray: ReturnType<typeof createFakeNotificationTray>;
let notifyTimer: ReturnType<typeof createNotifyTimer>;

beforeEach(() => {
  tray = createFakeNotificationTray();
  notifyTimer = createNotifyTimer({ registration: tray.registration });
});

describe("notifyTimer", () => {
  it("shows a deadline in the timer's server slot, alerting even if it replaces something", async () => {
    // Act
    await notifyTimer(SYNCED_TIMER, NotifyKind.Deadline);

    // Assert
    expect(tray.open).toEqual([
      {
        title: "Standup",
        body: "Time's up",
        tag: "3189b62d-87b4-4768-aa58-81f30c6c02d3",
        renotify: true,
        data: { kind: "deadline" },
      },
    ]);
  });

  it("uses a local slot for a timer that has not synced", async () => {
    // Act
    await notifyTimer({ ...SYNCED_TIMER, serverId: null }, NotifyKind.Deadline);

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["local-1"]);
  });

  it("replaces what is already in the timer's slot", async () => {
    // Arrange
    tray.seed({ title: "Standup", tag: SYNCED_TIMER.serverId, body: "Time's almost up" });

    // Act
    await notifyTimer(SYNCED_TIMER, NotifyKind.Deadline);

    // Assert
    expect(tray.open.map((entry) => entry.body)).toEqual(["Time's up"]);
  });
});

describe("notifyTimer (the event is already in the slot)", () => {
  it("does not show a deadline again when the server push got there first", async () => {
    // Arrange
    tray.seed({
      title: "Standup",
      tag: SYNCED_TIMER.serverId,
      body: "Time's up",
      data: { kind: "deadline" },
    });

    // Act
    await notifyTimer(SYNCED_TIMER, NotifyKind.Deadline);

    // Assert
    expect(tray.open.map((entry) => entry.renotify)).toEqual([undefined]);
  });

  it("shows a lead with the same copy the server push uses", async () => {
    // Act
    await notifyTimer({ ...SYNCED_TIMER, emoji: "⏰" }, NotifyKind.Lead);

    // Assert
    expect(tray.open.map((entry) => [entry.title, entry.body])).toEqual([
      ["⏰ Standup", "Time's almost up"],
    ]);
  });

  it("still shows the notification when the tray cannot be read", async () => {
    // Arrange
    tray.failReads();

    // Act
    await notifyTimer(SYNCED_TIMER, NotifyKind.Deadline);

    // Assert
    expect(tray.open.map((entry) => entry.title)).toEqual(["Standup"]);
  });
});
