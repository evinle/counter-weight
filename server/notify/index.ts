import webPush from 'web-push'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import type { DurableContext } from '@aws/durable-execution-sdk-js'
import { createDb } from '../db/index.js'
import { getNotifyEnv } from '../env.js'
import { handleLead, handleDeadline } from './handler.js'
import { createPushFanout } from './pushFanout.js'
import { createNotifyDb } from './notifyDb.js'
import { parseSchedulePayload, firesAt } from './events.js'
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

export function buildHandler(
  getNotifyDb: () => Promise<NotifyDb>,
  getSendNotification: () => Promise<SendNotification>,
) {
  return async (payload: SchedulePayload, context: DurableContext) => {
    const event = parseSchedulePayload(payload)
    const waitMs = firesAt(event).getTime() - Date.now()
    if (waitMs > 0) await context.wait('fire-at', { seconds: Math.ceil(waitMs / 1000) })

    const [db, sendNotification] = await Promise.all([getNotifyDb(), getSendNotification()])
    const deps = { db, push: createPushFanout(db, sendNotification) }
    switch (event.kind) {
      case 'lead':
        await handleLead(event, deps)
        break
      case 'deadline':
        await handleDeadline(event, deps)
        break
      case 'overdue':
        throw new Error('Overdue nudges are not implemented yet')
      default: {
        const unhandled: never = event
        throw new Error(`Unhandled event kind: ${JSON.stringify(unhandled)}`)
      }
    }
  }
}

export const handler = withDurableExecution(buildHandler(realGetNotifyDb, realGetSendNotification))
