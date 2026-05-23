import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { FastifyRequest } from "fastify";
import { createDb } from "../db/index.js";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type { Db } from "../db/index.js";
import { typedEnv } from "./index.js";

let _db: Db | null = null;

async function getDb(): Promise<Db> {
  if (_db) return _db;

  const sm = new SecretsManagerClient({});
  const secret = await sm.send(
    new GetSecretValueCommand({ SecretId: typedEnv.DB_SECRET_ARN }),
  );
  const { username, password, host, port, dbname } = JSON.parse(
    secret.SecretString!,
  );
  const proxyEndpoint = typedEnv.DB_PROXY_ENDPOINT;
  const url = `postgresql://${username}:${encodeURIComponent(password)}@${proxyEndpoint}:${port}/${dbname}?sslmode=require`;

  _db = createDb(url);
  return _db;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: typedEnv.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: typedEnv.COGNITO_CLIENT_ID,
});

export async function createContext({ req }: { req: FastifyRequest }) {
  const db = await getDb();
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) return { userId: null, db };

  try {
    const payload = await verifier.verify(auth.slice(7));
    return { userId: payload.sub, db };
  } catch {
    return { userId: null, db };
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>;
