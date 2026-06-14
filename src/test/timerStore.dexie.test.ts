import 'fake-indexeddb/auto'
import { beforeEach, describe, it, expect } from "vitest";
import { waitFor } from '@testing-library/react'
import { useTimerStore } from "../store/timerStore";
import { db } from "../db";
import type { Timer } from "../db/schema";

const BASE_DB_TIMER = {
  title: 'Test',
  description: null,
  emoji: null,
  originalTargetDatetime: new Date('2026-01-01T00:00:00.000Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  serverId: null,
  userId: null,
  syncStatus: 'synced',
  version: null,
  tagIds: [],
} satisfies Omit<Timer, 'id' | 'targetDatetime'>

describe("timerStore Dexie writes", () => {
  beforeEach(async () => {
    useTimerStore.setState({ firedTimer: null, activeTimers: [] });
    await db.timers.clear();
  });

  it("writes status fired to Dexie when a timer fires", async () => {
    // Arrange
    const pastDue = new Date(Date.now() - 1000);
    const id = await db.timers.add({ ...BASE_DB_TIMER, targetDatetime: pastDue });
    const timer = (await db.timers.get(id))!;

    // Act
    useTimerStore.getState().sync([timer]);

    // Assert
    await waitFor(async () => {
      const updated = await db.timers.get(id);
      expect(updated?.status).toBe('fired');
    });
  });

  it("does not update updatedAt when a timer fires", async () => {
    // Arrange
    const originalUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    const pastDue = new Date(Date.now() - 1000);
    const id = await db.timers.add({ ...BASE_DB_TIMER, targetDatetime: pastDue, updatedAt: originalUpdatedAt });
    const timer = (await db.timers.get(id))!;

    // Act
    useTimerStore.getState().sync([timer]);

    // Assert
    await waitFor(async () => {
      const updated = await db.timers.get(id);
      expect(updated?.status).toBe('fired');
    });
    const updated = await db.timers.get(id);
    expect(updated?.updatedAt).toEqual(originalUpdatedAt);
  });
});
