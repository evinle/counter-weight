import { eq } from 'drizzle-orm'
import { timers, pushSubscriptions, timerEvents } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { NotifyDb } from './handler.js'

export function createNotifyDb(db: Db): NotifyDb {
  return {
    async getTimerByServerId(serverId) {
      const [row] = await db
        .select({ id: timers.id, userId: timers.userId, status: timers.status, targetDatetime: timers.targetDatetime, title: timers.title, emoji: timers.emoji })
        .from(timers)
        .where(eq(timers.id, serverId))
      return row ?? null
    },

    async getSubscriptionsForUser(userId) {
      return db
        .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, subscription: pushSubscriptions.subscription })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
    },

    async deleteSubscription(id) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
    },

    async insertTimerEvent(event) {
      await db.insert(timerEvents).values(event)
    },
  }
}
