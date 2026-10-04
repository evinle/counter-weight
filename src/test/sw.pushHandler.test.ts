import { describe, it, expect, beforeEach } from "vitest";
import { createPushHandler } from "../sw.pushHandler";
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

describe("createPushHandler", () => {
  it("shows a deadline push as a notification in the timer's slot", async () => {
    // Arrange
    const data = { serverId: "timer-1", title: "Standup", emoji: "⏰", kind: "deadline" };

    // Act
    await handlePush(data);

    // Assert
    expect(tray.open).toEqual([
      { title: "⏰ Standup", body: "Time's up", tag: "timer-1", renotify: true },
    ]);
  });

  it("replaces the timer's earlier notification with the newer one", async () => {
    // Arrange
    await handlePush({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

    // Act
    await handlePush({
      serverId: "timer-1",
      title: "Standup",
      emoji: "",
      kind: "overdue",
      overdueBy: "15m",
    });

    // Assert
    expect(tray.open).toEqual([
      { title: "Standup", body: "Overdue by 15m", tag: "timer-1", renotify: true },
    ]);
  });
});

describe("createPushHandler (separate slots and best-effort clean-up)", () => {
  it("keeps a separate notification for each timer", async () => {
    // Arrange
    await handlePush({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

    // Act
    await handlePush({ serverId: "timer-2", title: "Laundry", emoji: "", kind: "deadline" });

    // Assert
    expect(tray.open.map((entry) => entry.tag)).toEqual(["timer-1", "timer-2"]);
  });

  it("still shows the notification when the tray cannot be read", async () => {
    // Arrange
    const failingRead = {
      ...tray.registration,
      async getNotifications(): Promise<never> {
        throw new Error("getNotifications unsupported");
      },
    };
    const handle = createPushHandler({
      registration: failingRead,
      hasVisibleClient: async () => false,
    });

    // Act
    await handle({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

    // Assert
    expect(tray.open.map((entry) => entry.title)).toEqual(["Standup"]);
  });
});

describe("createPushHandler (a notification that will not close)", () => {
  it("still shows the new notification and closes the rest of the old ones", async () => {
    // Arrange
    await tray.registration.showNotification("Stuck", { tag: "timer-1" });
    await tray.registration.showNotification("Stale", { tag: "timer-1" });
    const [, ...others] = await tray.registration.getNotifications({ tag: "timer-1" });
    const handle = createPushHandler({
      registration: {
        ...tray.registration,
        getNotifications: async () => [
          {
            close() {
              throw new Error("close failed");
            },
          },
          ...others,
        ],
      },
      hasVisibleClient: async () => false,
    });

    // Act
    await handle({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

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
    await handle({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

    // Assert
    expect(tray.open).toEqual([]);
  });

  it("keeps the earlier notification and surfaces the error when showing fails", async () => {
    // Arrange
    await handlePush({ serverId: "timer-1", title: "Standup", emoji: "", kind: "lead" });
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
    const result = handle({ serverId: "timer-1", title: "Standup", emoji: "", kind: "deadline" });

    // Assert
    await expect(result).rejects.toThrow("show failed");
    expect(tray.open.map((entry) => entry.body)).toEqual(["Time's almost up"]);
  });
});
