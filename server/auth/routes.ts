import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAuthEnv } from "../env.js";
import { CookieSerializeOptions } from "@fastify/cookie";

const callbackBody = z.object({ code: z.string(), origin: z.string().url() });
const COOKIE_OPTS: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/auth",
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

// Cached at module level — fetched once per cold start.
// Falls back to COGNITO_CLIENT_SECRET for local dev and tests.
let cachedClientSecret: string | undefined;
async function getClientSecret(): Promise<string> {
  if (cachedClientSecret) return cachedClientSecret;
  const raw = getAuthEnv().COGNITO_CLIENT_SECRET;
  if (raw) {
    cachedClientSecret = raw;
    return raw;
  }
  const sm = new SecretsManagerClient({});
  const { SecretString } = await sm.send(
    new GetSecretValueCommand({
      SecretId: getAuthEnv().COGNITO_CLIENT_SECRET_ARN,
    }),
  );
  if (!SecretString)
    throw new Error("Cognito client secret is not a string secret");
  cachedClientSecret = SecretString;
  return cachedClientSecret;
}

async function cognitoBasicAuth(): Promise<string> {
  const secret = await getClientSecret();
  return `Basic ${Buffer.from(`${getAuthEnv().COGNITO_CLIENT_ID}:${secret}`).toString("base64")}`;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/callback", async (req, reply) => {
    const parsed = callbackBody.safeParse(req.body);
    if (!parsed.success)
      return reply.status(400).send({ error: "Invalid body" });

    const { code, origin } = parsed.data;
    const ALLOWED_ORIGINS: Record<string, string> = {
      "https://localhost:5174": getAuthEnv().AUTH_CALLBACK_URL_LOCAL,
      "https://counter-weight.app": getAuthEnv().AUTH_CALLBACK_URL_PROD,
    };
    const redirectUri = ALLOWED_ORIGINS[origin];
    if (!redirectUri)
      return reply.status(400).send({ error: "Invalid origin" });

    const tokenRes = await fetch(
      `${getAuthEnv().COGNITO_DOMAIN}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: await cognitoBasicAuth(),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    if (!tokenRes.ok)
      return reply.status(400).send({ error: "Token exchange failed" });

    const tokens = (await tokenRes.json()) as {
      id_token: string;
      refresh_token: string;
      expires_in: number;
    };

    reply.setCookie("refresh_token", tokens.refresh_token, COOKIE_OPTS);
    return { idToken: tokens.id_token, expiresIn: tokens.expires_in };
  });

  app.post("/refresh", async (req, reply) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken)
      return reply.status(401).send({ error: "No refresh token" });

    const tokenRes = await fetch(
      `${getAuthEnv().COGNITO_DOMAIN}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: await cognitoBasicAuth(),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );

    if (!tokenRes.ok) {
      reply.clearCookie("refresh_token", { path: "/auth" });
      return reply.status(401).send({ error: "Refresh failed" });
    }

    const tokens = (await tokenRes.json()) as {
      id_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Cognito may rotate the refresh token
    if (tokens.refresh_token) {
      reply.setCookie("refresh_token", tokens.refresh_token, COOKIE_OPTS);
    }

    return { idToken: tokens.id_token, expiresIn: tokens.expires_in };
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie("refresh_token", { path: "/auth" });
    return { ok: true };
  });
};
