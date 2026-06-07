import { vi, describe, it, expect } from "vitest";
import { createNotifyTimer } from "../sw.notify";
import type { SyncTimerEntry } from "../sw.notify";

const BASE_TIMER = {
  id: 1,
  title: "Standup",
  emoji: undefined,
  targetDatetime: "2026-06-07T09:00:00.000Z",
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
    // Arrange
    const { registration, showNotification } = makeRegistration();
    const notifyTimer = createNotifyTimer({ registration });

    // Act
    notifyTimer(BASE_TIMER);

    // Assert
    expect(showNotification).toHaveBeenCalledOnce();
  });
});
