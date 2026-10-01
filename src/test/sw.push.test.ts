import { describe, it, expect } from "vitest";
import { parsePushPayload, pushNotificationBody } from "../sw.push";
import type { PushPayload } from "../sw.push";

describe("parsePushPayload", () => {
  it("parses an overdue nudge with its kind and how long it has been overdue", () => {
    const data = {
      serverId: "timer-1",
      title: "Standup",
      emoji: "⏰",
      kind: "overdue",
      overdueBy: "1h 20m",
    };

    const payload = parsePushPayload(data);

    expect(payload).toEqual({
      serverId: "timer-1",
      title: "Standup",
      emoji: "⏰",
      kind: "overdue",
      overdueBy: "1h 20m",
    });
  });
});

describe("parsePushPayload (older and invalid payloads)", () => {
  it("treats a payload with no kind as a deadline (sent before kind existed)", () => {
    const data = { serverId: "timer-1", title: "Standup", emoji: "" };

    const payload = parsePushPayload(data);

    expect(payload).toEqual({
      serverId: "timer-1",
      title: "Standup",
      emoji: "",
      kind: "deadline",
    });
  });

  it("rejects a payload missing a required field", () => {
    const data = { serverId: "timer-1", emoji: "", kind: "deadline" };

    const payload = parsePushPayload(data);

    expect(payload).toBeNull();
  });

  it("rejects a payload with an unknown kind", () => {
    const data = { serverId: "timer-1", title: "Standup", emoji: "", kind: "snooze" };

    const payload = parsePushPayload(data);

    expect(payload).toBeNull();
  });

  it("rejects data that is not an object", () => {
    const payload = parsePushPayload("timer-1");

    expect(payload).toBeNull();
  });
});

const BASE_PAYLOAD = {
  serverId: "timer-1",
  title: "Standup",
  emoji: "⏰",
  kind: "deadline",
} satisfies PushPayload;

describe("pushNotificationBody", () => {
  it("says how long a timer has been overdue for an overdue nudge", () => {
    const payload = {
      ...BASE_PAYLOAD,
      kind: "overdue",
      overdueBy: "1h 20m",
    } satisfies PushPayload;

    const body = pushNotificationBody(payload);

    expect(body).toBe("Overdue by 1h 20m");
  });
});

describe("pushNotificationBody (other kinds)", () => {
  it("says the time is almost up for a lead reminder", () => {
    const payload = { ...BASE_PAYLOAD, kind: "lead" } satisfies PushPayload;

    const body = pushNotificationBody(payload);

    expect(body).toBe("Time's almost up");
  });

  it("says the time is up for a deadline", () => {
    const body = pushNotificationBody(BASE_PAYLOAD);

    expect(body).toBe("Time's up");
  });

  it("falls back to a plain overdue message when no duration was sent", () => {
    const payload = { ...BASE_PAYLOAD, kind: "overdue" } satisfies PushPayload;

    const body = pushNotificationBody(payload);

    expect(body).toBe("Overdue");
  });

  it("does not depend on the title containing the word reminder", () => {
    const payload = { ...BASE_PAYLOAD, title: "Reminder: Standup" } satisfies PushPayload;

    const body = pushNotificationBody(payload);

    expect(body).toBe("Time's up");
  });
});
