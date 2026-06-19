import { vi, describe, it, expect } from "vitest";
import { createNotifyTimer } from "../sw.notify";
import { NotifyKind } from "../sw.scheduler";
import type { SyncTimerEntry } from "../sw.scheduler";

const BASE_TIMER = {
  id: 1,
  serverId: null,
  title: "Standup",
  emoji: undefined,
  targetDatetime: "2026-06-07T09:00:00.000Z",
  leadTimeMs: null,
} satisfies SyncTimerEntry;

function makeRegistration() {
  const showNotification =
    vi.fn<
      (
        ...params: Parameters<ServiceWorkerRegistration["showNotification"]>
      ) => Promise<void>
    >();
  const registration = { showNotification } satisfies Pick<
    ServiceWorkerRegistration,
    "showNotification"
  >;
  return { registration, showNotification };
}

describe("notifyTimer", () => {
  it("always calls showNotification without checking client visibility", () => {
    const { registration, showNotification } = makeRegistration();
    const notifyTimer = createNotifyTimer({ registration });

    notifyTimer(BASE_TIMER, NotifyKind.Deadline);

    expect(showNotification).toHaveBeenCalledOnce();
  });

  it("deadline kind uses time's-up body", () => {
    const { registration, showNotification } = makeRegistration();
    const notifyTimer = createNotifyTimer({ registration });

    notifyTimer(BASE_TIMER, NotifyKind.Deadline);

    expect(showNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: "Time's up" }),
    );
  });

  it("lead kind uses heads-up body", () => {
    const { registration, showNotification } = makeRegistration();
    const notifyTimer = createNotifyTimer({ registration });

    notifyTimer(BASE_TIMER, NotifyKind.Lead);

    expect(showNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: "Starting soon" }),
    );
  });
});
