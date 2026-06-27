import "fake-indexeddb/auto";
import { fromPartial } from "@total-typescript/shoehorn";
import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { SyncStatuses, TimerType } from "../db/schema";
import { useSyncEngine } from "../hooks/useSyncEngine";
import type { AuthUser } from "../hooks/useAuth";

// ─── Mock ─────────────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpcReact: {
    sync: {
      full: {
        useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })),
      },
    },
  },
  idToken: "mock-token",
  setIdToken: vi.fn(),
}));

import { trpcReact } from "../lib/trpc";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_RESPONSE = {
  synced: { tags: [], groups: [], timers: [] },
  overruled: { tags: [], groups: [], timers: [] },
  serverNow: "2026-06-27T00:00:00.000Z",
};

const USER = {
  userId: "user-1",
  email: "user@example.com",
  firstName: "Test",
} satisfies AuthUser;

const BASE_TIMER = {
  title: "Test",
  description: null,
  emoji: null,
  targetDatetime: new Date("2026-06-01T12:00:00Z"),
  originalTargetDatetime: new Date("2026-06-01T12:00:00Z"),
  status: "active" as const,
  priority: "medium" as const,
  recurrenceRule: null,
  tagIds: [] as string[],
  timerType: TimerType.Reminder,
  leadTimeMs: null,
  workSessions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: "user-1",
  version: null,
};

const BASE_TAG = {
  userId: "user-1",
  name: "Work",
  color: "#ff0000",
  emoji: null,
  version: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_GROUP = {
  userId: "user-1",
  name: "My Group",
  emoji: null,
  color: null,
  conditions: { op: "AND" as const, conditions: [] },
  version: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(async () => {
  await db.timers.clear();
  await db.tags.clear();
  await db.groups.clear();
  vi.clearAllMocks();
  localStorage.clear();
  mockMutateAsync.mockResolvedValue(EMPTY_RESPONSE);
  vi.mocked(trpcReact.sync.full.useMutation).mockReturnValue(
    fromPartial({ mutateAsync: mockMutateAsync, isPending: false }),
  );
});

// ─── Drain: timers ────────────────────────────────────────────────────────────

describe("timer drain", () => {
  it("pending timer: mutateAsync receives op:upsert and synced entry updates serverId in Dexie", async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: "pending",
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [],
        groups: [],
        timers: [{ op: "upsert", clientId: id, serverId: "srv-timer-1" }],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const timer = await db.timers.get(id);
      expect(timer?.syncStatus).toBe("synced");
      expect(timer?.serverId).toBe("srv-timer-1");
    });

    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.timers).toContainEqual(
      expect.objectContaining({ op: "upsert", clientId: id }),
    );
  });

  it("completed timer sends op:complete in input", async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      status: "completed",
      serverId: "srv-done",
      syncStatus: "pending",
      version: 2,
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [],
        groups: [],
        timers: [{ op: "complete", clientId: id, serverId: "srv-done" }],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const timer = await db.timers.get(id);
      expect(timer?.syncStatus).toBe("synced");
    });

    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.timers).toContainEqual(
      expect.objectContaining({ op: "complete", clientId: id, serverId: "srv-done" }),
    );
  });

  it("cancelled timer sends op:cancel in input", async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      status: "cancelled",
      serverId: "srv-cancelled",
      syncStatus: "pending",
      version: 3,
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [],
        groups: [],
        timers: [{ op: "cancel", clientId: id, serverId: "srv-cancelled" }],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const timer = await db.timers.get(id);
      expect(timer?.syncStatus).toBe("synced");
    });

    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.timers).toContainEqual(
      expect.objectContaining({ op: "cancel", clientId: id }),
    );
  });

});

// ─── Drain: tags ──────────────────────────────────────────────────────────────

describe("tag drain", () => {
  it("pending tag: synced entry updates serverId in Dexie", async () => {
    const id = await db.tags.add({
      ...BASE_TAG,
      serverId: null,
      syncStatus: "pending",
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [{ op: "upsert", clientId: id, serverId: "tag-srv-1" }],
        groups: [],
        timers: [],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const tag = await db.tags.get(id);
      expect(tag?.syncStatus).toBe("synced");
      expect(tag?.serverId).toBe("tag-srv-1");
    });

    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.tags).toContainEqual(
      expect.objectContaining({ op: "upsert", clientId: id }),
    );
  });

  it("deleted tag sends op:delete in input and is hard-deleted from Dexie on success", async () => {
    const id = await db.tags.add({
      ...BASE_TAG,
      serverId: "tag-srv-del",
      syncStatus: SyncStatuses.Deleted,
      version: 1,
    });

    // delete synced entries have no clientId — server confirms by serverId
    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [{ op: "delete", serverId: "tag-srv-del" }],
        groups: [],
        timers: [],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const tag = await db.tags.get(id);
      expect(tag).toBeUndefined();
    });

    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.tags).toContainEqual(
      expect.objectContaining({ op: "delete", serverId: "tag-srv-del" }),
    );
  });
});

// ─── Drain: groups ────────────────────────────────────────────────────────────

describe("group drain", () => {
  it("pending group: synced entry updates serverId in Dexie", async () => {
    const id = await db.groups.add({
      ...BASE_GROUP,
      serverId: null,
      syncStatus: "pending",
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [],
        groups: [{ op: "upsert", clientId: id, serverId: "grp-srv-1" }],
        timers: [],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const group = await db.groups.get(id);
      expect(group?.syncStatus).toBe("synced");
      expect(group?.serverId).toBe("grp-srv-1");
    });
  });
});

// ─── Overruled write-back ─────────────────────────────────────────────────────

describe("overruled write-back", () => {
  it("overruled timer record is upserted into Dexie (new record)", async () => {
    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      overruled: {
        tags: [],
        groups: [],
        timers: [
          fromPartial({
            id: "srv-overruled",
            title: "From Server",
            status: "active",
            priority: "medium",
            version: 3,
            userId: "user-1",
            targetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            originalTargetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            tagIds: [],
            timerType: TimerType.Reminder,
            leadTimeMs: null,
            workSessions: [],
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          }),
        ],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const timers = await db.timers.toArray();
      const t = timers.find((x) => x.serverId === "srv-overruled");
      expect(t?.title).toBe("From Server");
      expect(t?.version).toBe(3);
      expect(t?.syncStatus).toBe("synced");
    });
  });

  it("overruled timer record overwrites an existing local record (server wins)", async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: "srv-conflict",
      syncStatus: "pending",
      version: 1,
      title: "Local version",
    });

    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      overruled: {
        tags: [],
        groups: [],
        timers: [
          fromPartial({
            id: "srv-conflict",
            title: "Server version",
            status: "active",
            priority: "medium",
            version: 5,
            userId: "user-1",
            targetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            originalTargetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            tagIds: [],
            timerType: TimerType.Reminder,
            leadTimeMs: null,
            workSessions: [],
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          }),
        ],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const timer = await db.timers.get(id);
      expect(timer?.title).toBe("Server version");
      expect(timer?.version).toBe(5);
      expect(timer?.syncStatus).toBe("synced");
    });
  });

  it("overruled tag record is upserted into Dexie", async () => {
    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      overruled: {
        tags: [
          fromPartial({
            id: "tag-overruled",
            name: "Server Tag",
            color: "#fff",
            emoji: null,
            version: 2,
            userId: "user-1",
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          }),
        ],
        groups: [],
        timers: [],
      },
    });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(async () => {
      const tags = await db.tags.toArray();
      const t = tags.find((x) => x.serverId === "tag-overruled");
      expect(t?.name).toBe("Server Tag");
      expect(t?.syncStatus).toBe("synced");
    });
  });
});

// ─── since cursor ─────────────────────────────────────────────────────────────

describe("since cursor", () => {
  it("sends since:null on cold start (no localStorage)", async () => {
    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].since).toBeNull();
  });

  it("sends stored lastSyncedAt value as since on subsequent sync", async () => {
    localStorage.setItem("cw:lastSyncedAt", "2026-06-01T00:00:00.000Z");

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].since).toBe("2026-06-01T00:00:00.000Z");
  });

  it("stores serverNow as cw:lastSyncedAt after successful sync", async () => {
    const serverNow = "2026-06-27T12:00:00.000Z";
    mockMutateAsync.mockResolvedValueOnce({ ...EMPTY_RESPONSE, serverNow });

    renderHook(() => useSyncEngine({ user: USER }));

    await waitFor(() =>
      expect(localStorage.getItem("cw:lastSyncedAt")).toBe(serverNow),
    );
  });
});

// ─── Concurrency guard ────────────────────────────────────────────────────────

describe("concurrency guard", () => {
  it("drops trigger when mutation.isPending is true", async () => {
    vi.mocked(trpcReact.sync.full.useMutation).mockReturnValue(
      fromPartial({ mutateAsync: mockMutateAsync, isPending: true }),
    );

    const { result } = renderHook(() => useSyncEngine({ user: USER }));
    await result.current.triggerSync();

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

// ─── User null ────────────────────────────────────────────────────────────────

describe("user null", () => {
  it("does not call mutateAsync when user is null", () => {
    renderHook(() => useSyncEngine({ user: null }));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("triggerSync is a no-op when user is null", async () => {
    const { result } = renderHook(() => useSyncEngine({ user: null }));
    await result.current.triggerSync();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

// ─── triggerSync ──────────────────────────────────────────────────────────────

describe("triggerSync", () => {
  it("fires a sync and upserts overruled records into Dexie", async () => {
    const { result } = renderHook(() => useSyncEngine({ user: USER }));
    // Let mount sync settle before manually triggering
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      overruled: {
        tags: [],
        groups: [],
        timers: [
          fromPartial({
            id: "srv-trigger",
            title: "Pulled By triggerSync",
            status: "active",
            priority: "medium",
            version: 1,
            userId: "user-1",
            targetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            originalTargetDatetime: new Date("2026-06-01T12:00:00.000Z"),
            tagIds: [],
            timerType: TimerType.Reminder,
            leadTimeMs: null,
            workSessions: [],
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          }),
        ],
      },
    });

    await result.current.triggerSync();

    const timers = await db.timers.toArray();
    expect(timers.some((t) => t.serverId === "srv-trigger" && t.title === "Pulled By triggerSync")).toBe(true);
  });
});

// ─── Live query drain trigger ─────────────────────────────────────────────────

describe("live query drain trigger", () => {
  it("fires a sync when a pending timer is added after mount", async () => {
    renderHook(() => useSyncEngine({ user: USER }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    vi.clearAllMocks();
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: "pending",
    });
    mockMutateAsync.mockResolvedValueOnce({
      ...EMPTY_RESPONSE,
      synced: {
        tags: [],
        groups: [],
        timers: [{ op: "upsert", clientId: id, serverId: "srv-live" }],
      },
    });

    await waitFor(async () => {
      const timer = await db.timers.get(id);
      expect(timer?.syncStatus).toBe("synced");
    });
  });
});
