import { z } from 'zod'
import type { Priority, TimerStatus } from '../../../src/db/schema.ts'

export type { Priority, TimerStatus }

const priorityValues = ['low', 'medium', 'high', 'critical'] as const satisfies readonly Priority[]
const statusValues = ['active', 'fired', 'completed', 'missed', 'cancelled'] as const satisfies readonly TimerStatus[]

// z.union (not discriminatedUnion) because multiple variants share the same `field` value
export const FieldConditionSchema = z.union([
  z.object({ field: z.literal('tags'), op: z.literal('contains'), value: z.string() }),
  z.object({ field: z.literal('priority'), op: z.literal('eq'), value: z.enum(priorityValues) }),
  z.object({ field: z.literal('priority'), op: z.literal('in'), value: z.array(z.enum(priorityValues)) }),
  z.object({ field: z.literal('status'), op: z.literal('eq'), value: z.enum(statusValues) }),
  z.object({ field: z.literal('status'), op: z.literal('in'), value: z.array(z.enum(statusValues)) }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('before'), value: z.string() }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('after'), value: z.string() }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('overdue') }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('today') }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('within_days'), value: z.number() }),
  z.object({ field: z.literal('title'), op: z.literal('contains'), value: z.string() }),
  z.object({ field: z.literal('recurrenceRule'), op: z.literal('exists') }),
  z.object({ field: z.literal('recurrenceRule'), op: z.literal('not_exists') }),
  z.object({ field: z.literal('emoji'), op: z.literal('eq'), value: z.string() }),
])

export const GroupConditionsSchema = z.object({
  op: z.literal('AND'),
  conditions: z.array(FieldConditionSchema),
})

export type FieldCondition = z.infer<typeof FieldConditionSchema>
export type GroupConditions = z.infer<typeof GroupConditionsSchema>
