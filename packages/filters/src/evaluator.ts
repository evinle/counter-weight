import type { Timer } from '../../../src/db/schema.ts'
import type { FieldCondition, GroupConditions } from './schema.ts'

function matchesCondition(timer: Timer, condition: FieldCondition, now: Date): boolean {
  switch (condition.field) {
    case 'tags':
      if (condition.op === 'in') return condition.value.some(id => timer.tagIds.includes(id))
      return timer.tagIds.includes(condition.value)
    case 'priority':
      if (condition.op === 'eq') return timer.priority === condition.value
      return condition.value.includes(timer.priority)
    case 'status':
      if (condition.op === 'eq') return timer.status === condition.value
      return condition.value.includes(timer.status)
    case 'targetDatetime': {
      const t = timer.targetDatetime.getTime()
      switch (condition.op) {
        case 'before': return t < new Date(condition.value).getTime()
        case 'after': return t > new Date(condition.value).getTime()
        case 'overdue': return t < now.getTime()
        case 'today':
          return (
            timer.targetDatetime.getFullYear() === now.getFullYear() &&
            timer.targetDatetime.getMonth() === now.getMonth() &&
            timer.targetDatetime.getDate() === now.getDate()
          )
        case 'within_days': {
          const cutoff = new Date(now)
          cutoff.setDate(cutoff.getDate() + condition.value)
          return t >= now.getTime() && t <= cutoff.getTime()
        }
      }
    }
    case 'title':
      return timer.title.toLowerCase().includes(condition.value.toLowerCase())
    case 'recurrenceRule':
      if (condition.op === 'exists') return timer.recurrenceRule !== null
      return timer.recurrenceRule === null
    case 'emoji':
      return timer.emoji === condition.value
  }
}

export function applyFilter(timers: Timer[], conditions: GroupConditions, now: Date): Timer[] {
  if (conditions.conditions.length === 0) return timers
  return timers.filter(t => conditions.conditions.every(c => matchesCondition(t, c, now)))
}
