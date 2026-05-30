import webPush from 'web-push'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { createDb } from '../db/index.js'
import { getNotifyEnv } from '../env.js'
import { handleTimerFired } from './handler.js'
import { createNotifyDb } from './notifyDb.js'
import type { SendNotification } from './handler.js'

const sm = new SecretsManagerClient({})

let _dbPromise: Promise<ReturnType<typeof createDb>> | null = null

async function getDb() {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const env = getNotifyEnv()
      const secret = await sm.send(new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN }))
      if (!secret.SecretString) throw new Error('DB secret is not a string secret')
      const { username, password, port, dbname = 'postgres' } = JSON.parse(secret.SecretString)
      const url = `postgresql://${username}:${encodeURIComponent(password)}@${env.DB_ENDPOINT}:${port}/${dbname}?sslmode=require`
      return createDb(url)
    })()
  }
  return _dbPromise
}

let _sendNotificationPromise: Promise<SendNotification> | null = null

async function getSendNotification(): Promise<SendNotification> {
  if (!_sendNotificationPromise) {
    _sendNotificationPromise = (async () => {
      const env = getNotifyEnv()
      const secret = await sm.send(new GetSecretValueCommand({ SecretId: env.VAPID_SECRET_ARN }))
      if (!secret.SecretString) throw new Error('VAPID secret is not a string secret')
      const { privateKey } = JSON.parse(secret.SecretString)
      webPush.setVapidDetails('https://evinle.app', env.VAPID_PUBLIC_KEY, privateKey)
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

export const handler = async (event: { serverId: string; userId: string; targetDatetime: string }) => {
  const waitMs = new Date(event.targetDatetime).getTime() - Date.now()
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))

  const [db, sendNotification] = await Promise.all([getDb(), getSendNotification()])
  await handleTimerFired(event, createNotifyDb(db), sendNotification)
}
