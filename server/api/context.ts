import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { FastifyRequest } from "fastify";
import { createDb } from "../db/index.js";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import type { Db } from "../db/index.js";
import { getApiEnv } from "../env.js";
import { AwsScheduler, type Scheduler } from "./scheduler.js";
import { createTimersDb } from "./routers/timersDb.js";
import { createTagsDb } from "./routers/tagsDb.js";
import { createGroupsDb } from "./routers/groupsDb.js";

// Promise singleton — assignment is synchronous so concurrent requests share one init
let _dbPromise: Promise<Db> | null = null;

async function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const env = getApiEnv();
      const sm = new SecretsManagerClient({});
      const secret = await sm.send(
        new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN }),
      );
      if (!secret.SecretString)
        throw new Error("DB secret is not a string secret");
      const {
        username,
        password,
        port,
        dbname = "postgres",
      } = JSON.parse(secret.SecretString);
      const url = `postgresql://${username}:${encodeURIComponent(password)}@${env.DB_ENDPOINT}:${port}/${dbname}?sslmode=require`;
      return createDb(url);
    })();
  }
  return _dbPromise;
}

let _scheduler: Scheduler | null = null;

function getScheduler(): Scheduler {
  if (!_scheduler) {
    const env = getApiEnv();
    _scheduler = new AwsScheduler(
      new SchedulerClient({}),
      env.NOTIFY_LAMBDA_ARN,
      env.SCHEDULER_ROLE_ARN,
    );
  }
  return _scheduler;
}

// Lazy singleton — CognitoJwtVerifier.create() is synchronous so no race condition
let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!_verifier) {
    const env = getApiEnv();
    _verifier = CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: env.COGNITO_CLIENT_ID,
    });
  }
  return _verifier;
}

export async function createContext({ req }: { req: FastifyRequest }) {
  const db = await getDb();
  const timersDb = createTimersDb(db);
  const tagsDb = createTagsDb(db);
  const groupsDb = createGroupsDb(db);
  const scheduler = getScheduler();
  const auth = req.headers.authorization;
  const userAgent = req.headers['user-agent'] ?? null;

  const now = new Date();

  if (!auth?.startsWith("Bearer ")) return { userId: null, db, timersDb, tagsDb, groupsDb, scheduler, now, userAgent };

  try {
    const payload = await getVerifier().verify(auth.slice(7));
    return { userId: payload.sub, db, timersDb, tagsDb, groupsDb, scheduler, now, userAgent };
  } catch {
    return { userId: null, db, timersDb, tagsDb, groupsDb, scheduler, now, userAgent };
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>;
