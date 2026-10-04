import webPush from 'web-push'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import type { DurableContext } from '@aws/durable-execution-sdk-js'
import { createDb } from '../db/index.js'
import { getNotifyEnv } from '../env.js'
import { handleLead, handleDeadline, handleOverdueNudge } from './handler.js'
import { SchedulerClient } from '@aws-sdk/client-scheduler'
import { createPushFanout } from './pushFanout.js'
import { createNotificationScheduler } from './notificationScheduler.js'
import { AwsScheduler } from '../api/scheduler.js'
import type { Scheduler } from '../api/scheduler.js'
import { createNotifyDb } from './notifyDb.js'
import { parseSchedulePayload, firesAt } from './events.js'
import { aliasTargetArn } from './nudgeTarget.js'
import type { NotifyDb, SendNotification } from './handler.js'
import type { SchedulePayload } from '../api/scheduler.js'

const sm = new SecretsManagerClient({})

let _notifyDbPromise: Promise<NotifyDb> | null = null

async function realGetNotifyDb(): Promise<NotifyDb> {
  if (!_notifyDbPromise) {
    _notifyDbPromise = (async () => {
      const env = getNotifyEnv()
      const secret = await sm.send(new GetSecretValueCommand({ SecretId: env.NEON_SECRET_ARN }))
      if (!secret.SecretString) throw new Error('Neon secret is not a string secret')
      return createNotifyDb(createDb(secret.SecretString))
    })()
  }
  return _notifyDbPromise
}

let _sendNotificationPromise: Promise<SendNotification> | null = null

async function realGetSendNotification(): Promise<SendNotification> {
  if (!_sendNotificationPromise) {
    _sendNotificationPromise = (async () => {
      const env = getNotifyEnv()
      const secret = await sm.send(new GetSecretValueCommand({ SecretId: env.VAPID_SECRET_ARN }))
      if (!secret.SecretString) throw new Error('VAPID secret is not a string secret')
      webPush.setVapidDetails('https://evinle.app', env.VAPID_PUBLIC_KEY, secret.SecretString)
      return async (subscription, payload) => {
        const result = await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(payload),
        )
        return { statusCode: result.statusCode }
      }
    })()
  }
  return _sendNotificationPromise
}

let _scheduler: Scheduler | null = null

// Nudges invoke this same function again, so the schedule target is its alias. The target
// is the same for every invocation, so it is safe to build the scheduler once.
async function realGetScheduler(target: string): Promise<Scheduler> {
  if (!_scheduler) {
    const env = getNotifyEnv()
    _scheduler = new AwsScheduler(new SchedulerClient({}), target, env.SCHEDULER_ROLE_ARN)
  }
  return _scheduler
}

export function buildHandler(
  getNotifyDb: () => Promise<NotifyDb>,
  getSendNotification: () => Promise<SendNotification>,
  getScheduler: (target: string) => Promise<Scheduler>,
  getAliasName: () => string,
) {
  return async (payload: SchedulePayload, context: DurableContext) => {
    const event = parseSchedulePayload(payload)
    const waitMs = firesAt(event).getTime() - Date.now()
    if (waitMs > 0) await context.wait('fire-at', { seconds: Math.ceil(waitMs / 1000) })

    const [db, sendNotification, scheduler] = await Promise.all([
      getNotifyDb(),
      getSendNotification(),
      getScheduler(aliasTargetArn(context.lambdaContext.invokedFunctionArn, getAliasName())),
    ])
    const now = () => new Date()
    const deps = {
      db,
      push: createPushFanout(db, sendNotification),
      notifications: createNotificationScheduler(scheduler, now),
      now,
    }
    switch (event.kind) {
      case 'lead':
        await handleLead(event, deps)
        break
      case 'deadline':
        await handleDeadline(event, deps)
        break
      case 'overdue':
        await handleOverdueNudge(event, deps)
        break
      default: {
        const unhandled: never = event
        throw new Error(`Unhandled event kind: ${JSON.stringify(unhandled)}`)
      }
    }
  }
}

export const handler = withDurableExecution(
  buildHandler(realGetNotifyDb, realGetSendNotification, realGetScheduler, () => getNotifyEnv().NOTIFY_ALIAS_NAME),
)
