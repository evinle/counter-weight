import {
  pgTable, pgEnum, text, uuid, timestamp, integer, jsonb, index, unique, primaryKey,
} from 'drizzle-orm/pg-core'
import type { GroupConditions } from '../api/routers/groups.js'
import type { WorkSessionJson } from '../api/routers/timers.js'

export const TimerType = {
  Reminder: 'reminder',
  Task: 'task',
} as const satisfies Record<string, string>
export type TimerType = typeof TimerType[keyof typeof TimerType]

export const TimerStatus = {
  Active: 'active',
  Fired: 'fired',
  Completed: 'completed',
  Missed: 'missed',
  Cancelled: 'cancelled',
} as const satisfies Record<string, string>
export type TimerStatus = typeof TimerStatus[keyof typeof TimerStatus]

export const EventType = {
  Created: 'created',
  Updated: 'updated',
  Rescheduled: 'rescheduled',
  Completed: 'completed',
  Cancelled: 'cancelled',
  Fired: 'fired',
} as const satisfies Record<string, string>
export type EventType = typeof EventType[keyof typeof EventType]

export const timerStatusEnum = pgEnum('timer_status', [
  TimerStatus.Active,
  TimerStatus.Fired,
  TimerStatus.Completed,
  TimerStatus.Missed,
  TimerStatus.Cancelled,
])
export const Priority = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const satisfies Record<string, string>
export type Priority = typeof Priority[keyof typeof Priority]

export const priorityEnum = pgEnum('priority', [
  Priority.Low,
  Priority.Medium,
  Priority.High,
  Priority.Critical,
])
export const eventTypeEnum = pgEnum('event_type', [
  EventType.Created,
  EventType.Updated,
  EventType.Rescheduled,
  EventType.Completed,
  EventType.Cancelled,
  EventType.Fired,
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
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    targetDatetime: timestamp('target_datetime', { withTimezone: true }).notNull(),
    originalTargetDatetime: timestamp('original_target_datetime', { withTimezone: true }).notNull(),
    status: timerStatusEnum('status').notNull().default('active'),
    priority: priorityEnum('priority').notNull().default('medium'),
    recurrenceRule: jsonb('recurrence_rule').$type<RecurrenceRule | null>(),
    eventbridgeScheduleId: text('eventbridge_schedule_id'), // M3 populates this
    timerType: text('timer_type').notNull().default('reminder').$type<TimerType>(),
    leadTimeMs: integer('lead_time_ms'),
    workSessions: jsonb('work_sessions').$type<WorkSessionJson[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timers_user_status_idx').on(t.userId, t.status),
    index('timers_updated_at_idx').on(t.updatedAt),
  ],
)

export type RecurrenceRule = { cron: string; tz: string }

export type PushSubscriptionData = {
  p256dh: string
  auth: string
  deviceHint: string
}

export function isPushSubscriptionData(v: unknown): v is PushSubscriptionData {
  return (
    typeof v === 'object' &&
    v !== null &&
    'p256dh' in v &&
    'auth' in v &&
    'deviceHint' in v &&
    typeof v.p256dh === 'string' &&
    typeof v.auth === 'string' &&
    typeof v.deviceHint === 'string'
  )
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
  (t) => [unique('push_subscriptions_endpoint_user_unique').on(t.endpoint, t.userId)],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    color: text('color'),
    emoji: text('emoji'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tags_user_name_unique').on(t.userId, t.name),
    index('tags_user_idx').on(t.userId),
    index('tags_updated_at_idx').on(t.updatedAt),
  ],
)

export const timerTags = pgTable(
  'timer_tags',
  {
    timerId: uuid('timer_id').notNull().references(() => timers.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.timerId, t.tagId] })],
)

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    emoji: text('emoji'),
    color: text('color'),
    conditions: jsonb('conditions').$type<GroupConditions>().notNull().default({ op: 'AND', conditions: [] }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('groups_user_idx').on(t.userId),
    index('groups_updated_at_idx').on(t.updatedAt),
  ],
)

export const timerEvents = pgTable('timer_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  timerId: uuid('timer_id').notNull().references(() => timers.id),
  userId: text('user_id').notNull().references(() => users.id),
  eventType: eventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').default('{}'),
})
