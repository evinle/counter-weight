import {
  pgTable, pgEnum, text, uuid, timestamp, integer, boolean, jsonb, index, unique,
} from 'drizzle-orm/pg-core'

export const timerStatusEnum = pgEnum('timer_status', [
  'active', 'fired', 'completed', 'missed', 'cancelled',
])
export const priorityEnum = pgEnum('priority', [
  'low', 'medium', 'high', 'critical',
])
export const eventTypeEnum = pgEnum('event_type', [
  'created', 'updated', 'rescheduled', 'completed', 'cancelled',
])

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Cognito sub
  email: text('email').notNull(),
  settings: jsonb('settings').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const timers = pgTable(
  'timers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    groupId: uuid('group_id'), // no FK until M4
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    targetDatetime: timestamp('target_datetime', { withTimezone: true }).notNull(),
    originalTargetDatetime: timestamp('original_target_datetime', { withTimezone: true }).notNull(),
    status: timerStatusEnum('status').notNull().default('active'),
    priority: priorityEnum('priority').notNull().default('medium'),
    isFlagged: boolean('is_flagged').notNull().default(false),
    recurrenceRule: jsonb('recurrence_rule'),
    eventbridgeScheduleId: text('eventbridge_schedule_id'), // M3 populates this
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timers_user_status_idx').on(t.userId, t.status),
    index('timers_updated_at_idx').on(t.updatedAt),
  ],
)

export type PushSubscriptionData = {
  p256dh: string
  auth: string
  deviceHint: string
}

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    endpoint: text('endpoint').notNull(),
    subscription: jsonb('subscription').$type<PushSubscriptionData>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('push_subscriptions_endpoint_unique').on(t.endpoint)],
)

export const timerEvents = pgTable('timer_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  timerId: uuid('timer_id').notNull().references(() => timers.id),
  userId: text('user_id').notNull().references(() => users.id),
  eventType: eventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').default('{}'),
})
