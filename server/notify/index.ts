import webPush from 'web-push'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import type { DurableContext } from '@aws/durable-execution-sdk-js'
import { createDb } from '../db/index.js'
import { getNotifyEnv } from '../env.js'
import { handleTimerFired } from './handler.js'
import { createNotifyDb } from './notifyDb.js'
import type { NotifyDb, SendNotification } from './handler.js'

type EventPayload = { serverId: string; userId: string; targetDatetime: string; kind?: 'lead' | 'deadline' }

const sm = new SecretsManagerClient({})

let _notifyDbPromise: Promise<NotifyDb> | null = null

async function realGetNotifyDb(): Promise<NotifyDb> {
  if (!_notifyDbPromise) {
    _notifyDbPromise = (async () => {
      const env = getNotifyEnv()
      const secret = await sm.send(new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN }))
      if (!secret.SecretString) throw new Error('DB secret is not a string secret')
      const { username, password, port, dbname = 'postgres' } = JSON.parse(secret.SecretString)
      const url = `postgresql://${username}:${encodeURIComponent(password)}@${env.DB_ENDPOINT}:${port}/${dbname}?sslmode=require`
      return createNotifyDb(createDb(url))
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
  return async (event: EventPayload, context: DurableContext) => {
    const waitMs = new Date(event.targetDatetime).getTime() - Date.now()
    if (waitMs > 0) await context.wait('fire-at', { seconds: Math.ceil(waitMs / 1000) })

    const [db, sendNotification] = await Promise.all([getNotifyDb(), getSendNotification()])
    await handleTimerFired(event, db, sendNotification)
  }
}

export const handler = withDurableExecution(buildHandler(realGetNotifyDb, realGetSendNotification))
