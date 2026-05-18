# Phase 4: Auth Lambda [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 1 (server/ package):** Dependencies available — `fastify@^5`, `@fastify/aws-lambda@^4`, `@fastify/cookie@^11`, `@fastify/cors@^10`, `@aws-sdk/client-secrets-manager@^3`, `zod@^3.23`.

**From Phase 2 (AppStack env vars):** Auth Lambda receives these environment variables at runtime:
- `COGNITO_DOMAIN` — e.g. `https://counter-weight-auth.auth.us-east-1.amazoncognito.com`
- `COGNITO_CLIENT_ID` — Cognito app client ID
- `COGNITO_CLIENT_SECRET_ARN` — Secrets Manager ARN (fetched at cold start)
- `AUTH_CALLBACK_URL_PROD` — `https://counter-weight.app/auth/callback`
- `AUTH_CALLBACK_URL_LOCAL` — `http://localhost:5174/auth/callback`

For local dev and tests, set `COGNITO_CLIENT_SECRET` directly (no Secrets Manager call needed) — the `getClientSecret()` function checks this env var first.

**Entry point path:** AppStack bundles `server/auth/index.ts` as the Auth Lambda handler.

---

## Task 4.1: Auth routes (with tests)

**Files:**
- Create: `server/auth/routes.ts`
- Create: `server/auth/routes.test.ts`

- [ ] **Write the failing tests first**

Create `server/auth/routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authRoutes } from './routes.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeApp() {
  const app = Fastify({ logger: false })
  app.register(cookie)
  app.register(authRoutes, { prefix: '/auth' })
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.COGNITO_DOMAIN = 'https://test.auth.us-east-1.amazoncognito.com'
  process.env.COGNITO_CLIENT_ID = 'client-id'
  process.env.COGNITO_CLIENT_SECRET = 'client-secret'
  process.env.AUTH_CALLBACK_URL_PROD = 'https://counter-weight.app/auth/callback'
  process.env.AUTH_CALLBACK_URL_LOCAL = 'http://localhost:5174/auth/callback'
})

describe('POST /auth/callback', () => {
  it('sets httpOnly cookie and returns idToken on successful code exchange', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id_token: 'test-id-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      }),
    })

    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/callback',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code-123', origin: 'http://localhost:5174' }),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ idToken: 'test-id-token', expiresIn: 3600 })
    const setCookie = res.headers['set-cookie'] as string
    expect(setCookie).toContain('refresh_token=test-refresh-token')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
  })

  it('returns 400 if Cognito token exchange fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/callback',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'bad-code', origin: 'http://localhost:5174' }),
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /auth/refresh', () => {
  it('returns new idToken when valid refresh cookie is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id_token: 'new-id-token', expires_in: 3600 }),
    })

    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: 'valid-refresh-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().idToken).toBe('new-id-token')
  })

  it('returns 401 when no refresh cookie is present', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('clears cookie and returns 401 when Cognito rejects the refresh token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: 'expired-token' },
    })

    expect(res.statusCode).toBe(401)
    const setCookie = res.headers['set-cookie'] as string
    expect(setCookie).toContain('refresh_token=;')
  })
})

describe('POST /auth/logout', () => {
  it('clears the refresh_token cookie', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(200)
    const setCookie = res.headers['set-cookie'] as string
    expect(setCookie).toContain('refresh_token=;')
  })
})
```

- [ ] **Run tests — verify they fail (routes.ts not yet created)**

```bash
cd server && npm test
```

Expected: FAIL — `Cannot find module './routes.js'`

- [ ] **Create `server/auth/routes.ts`**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const callbackBody = z.object({ code: z.string(), origin: z.string().url() })
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days
}

// Cached at module level — fetched once per cold start.
// Falls back to COGNITO_CLIENT_SECRET for local dev and tests.
let cachedClientSecret: string | undefined
async function getClientSecret(): Promise<string> {
  if (cachedClientSecret) return cachedClientSecret
  const raw = process.env.COGNITO_CLIENT_SECRET
  if (raw) { cachedClientSecret = raw; return raw }
  const sm = new SecretsManagerClient({})
  const { SecretString } = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.COGNITO_CLIENT_SECRET_ARN! }),
  )
  cachedClientSecret = SecretString!
  return cachedClientSecret
}

async function cognitoBasicAuth(): Promise<string> {
  const secret = await getClientSecret()
  return `Basic ${Buffer.from(`${process.env.COGNITO_CLIENT_ID}:${secret}`).toString('base64')}`
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/callback', async (req, reply) => {
    const parsed = callbackBody.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body' })

    const { code, origin } = parsed.data
    const ALLOWED_ORIGINS: Record<string, string | undefined> = {
      'http://localhost:5174': process.env.AUTH_CALLBACK_URL_LOCAL,
      'https://counter-weight.app': process.env.AUTH_CALLBACK_URL_PROD,
    }
    const redirectUri = ALLOWED_ORIGINS[origin]
    if (!redirectUri) return reply.status(400).send({ error: 'Invalid origin' })

    const tokenRes = await fetch(`${process.env.COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: await cognitoBasicAuth(),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) return reply.status(400).send({ error: 'Token exchange failed' })

    const tokens = (await tokenRes.json()) as {
      id_token: string
      refresh_token: string
      expires_in: number
    }

    reply.setCookie('refresh_token', tokens.refresh_token, COOKIE_OPTS)
    return { idToken: tokens.id_token, expiresIn: tokens.expires_in }
  })

  app.post('/refresh', async (req, reply) => {
    const refreshToken = req.cookies.refresh_token
    if (!refreshToken) return reply.status(401).send({ error: 'No refresh token' })

    const tokenRes = await fetch(`${process.env.COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: await cognitoBasicAuth(),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!tokenRes.ok) {
      reply.clearCookie('refresh_token', { path: '/auth' })
      return reply.status(401).send({ error: 'Refresh failed' })
    }

    const tokens = (await tokenRes.json()) as {
      id_token: string
      refresh_token?: string
      expires_in: number
    }

    // Cognito may rotate the refresh token
    if (tokens.refresh_token) {
      reply.setCookie('refresh_token', tokens.refresh_token, COOKIE_OPTS)
    }

    return { idToken: tokens.id_token, expiresIn: tokens.expires_in }
  })

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('refresh_token', { path: '/auth' })
    return { ok: true }
  })
}
```

- [ ] **Run tests — verify they pass**

```bash
cd server && npm test -- server/auth/routes.test.ts
```

Expected: PASS (6 tests)

- [ ] **Commit**

```bash
git add server/auth/routes.ts server/auth/routes.test.ts
git commit -m "feat(server): add auth Lambda routes (callback, refresh, logout)"
```

---

## Task 4.2: Auth Lambda handler

**Files:**
- Create: `server/auth/index.ts`

- [ ] **Create `server/auth/index.ts`**

```typescript
import Fastify from 'fastify'
import awsLambdaFastify from '@fastify/aws-lambda'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { authRoutes } from './routes.js'

const app = Fastify({ logger: true })

app.register(cors, {
  origin: ['http://localhost:5174', 'https://counter-weight.app'],
  credentials: true,
})
app.register(cookie)
app.register(authRoutes, { prefix: '/auth' })

export const handler = awsLambdaFastify(app)
```

- [ ] **Commit**

```bash
git add server/auth/index.ts
git commit -m "feat(server): add auth Lambda handler"
```
