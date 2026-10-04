import { describe, it, expect } from "vitest";
import { notificationSlot } from "../sw.notificationSlot";

describe("notificationSlot", () => {
  it("is the server identity once the timer has one", () => {
    expect(notificationSlot({ id: 12, serverId: "3189b62d-87b4-4768-aa58-81f30c6c02d3" })).toBe(
      "3189b62d-87b4-4768-aa58-81f30c6c02d3",
    );
  });

  it("falls back to a local name for a timer that has not synced", () => {
    expect(notificationSlot({ id: 12, serverId: null })).toBe("local-12");
  });

  it("gives two unsynced timers different slots", () => {
    expect(notificationSlot({ id: 12, serverId: null })).not.toBe(
      notificationSlot({ id: 13, serverId: null }),
    );
  });
});
