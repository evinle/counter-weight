# Auth & Custom Domain Setup

## Problem

The frontend (`counter-weight.evinle.app`) and backend (`*.execute-api.ap-southeast-2.amazonaws.com`) were on different origins. This caused two issues:

1. **`SameSite=Strict` cookie blocked** — after the OAuth code callback, the browser made a cross-origin `POST /auth/callback` to the backend. The backend set a `refresh_token` cookie with `SameSite=Strict`, but on subsequent requests from the frontend the cookie was silently dropped because the request was cross-site.

2. **CORS preflight returning 401** — tRPC routes on `/trpc/{proxy+}` were protected by an API Gateway JWT authorizer. Despite API Gateway's built-in CORS handling, the JWT authorizer ran *before* the CORS preflight response was sent, returning `401 Unauthorized` on `OPTIONS` requests. The browser rejected these preflights because they weren't 2xx, blocking all tRPC calls.

## Solution

### 1. Custom domain on API Gateway (`api.evinle.app`)

Putting the API on a subdomain of `evinle.app` makes `counter-weight.evinle.app` → `api.evinle.app` a **same-site** request (same registrable domain). This allows `SameSite=Lax` cookies to flow correctly between the two.

**CDK changes (`infra/lib/app-stack.ts`):**
- Added an ACM certificate for `api.evinle.app` with DNS validation
- Created an API Gateway custom domain pointing at that certificate
- Added an API mapping from the custom domain to the HTTP API

**Cloudflare DNS (manual):**
- Added ACM validation CNAME (proxy off) to prove domain ownership
- Added `api.evinle.app` CNAME → API Gateway regional domain (proxy off — API Gateway handles its own TLS termination)

### 2. Cookie updated to `SameSite=Lax` + `Domain=evinle.app`

**`server/auth/routes.ts`:**

```ts
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",      // was "strict"
  domain: "evinle.app", // scopes cookie to all subdomains
  path: "/auth",
  maxAge: 30 * 24 * 60 * 60,
};
```

`SameSite=Lax` allows the cookie to be sent on same-site cross-origin requests (frontend → API). `Domain=evinle.app` is required so the cookie set by `api.evinle.app` is sent back to `api.evinle.app` when the request originates from `counter-weight.evinle.app`.

Both `clearCookie` calls were updated to include `domain: "evinle.app"` — without matching domain the browser can't find the cookie to delete it.

### 3. Explicit OPTIONS route without JWT authorizer

**CDK changes (`infra/lib/app-stack.ts`):**

```ts
api.addRoutes({
  path: "/trpc/{proxy+}",
  methods: [apigateway.HttpMethod.OPTIONS],
  integration: new HttpLambdaIntegration("ApiOptionsIntegration", apiLambda),
  // no authorizer
});
```

API Gateway HTTP API is documented to handle CORS preflight before invoking the JWT authorizer, but in practice the authorizer runs first and returns `401` on `OPTIONS` requests. Adding an explicit OPTIONS route without an authorizer bypasses this — preflights go straight to the Lambda, where Fastify's `@fastify/cors` middleware returns `200` with the correct headers.

## Why Cloudflare proxy must be off for `api.evinle.app`

API Gateway custom domains terminate TLS themselves using the ACM certificate. If Cloudflare's proxy (orange cloud) is enabled, Cloudflare terminates TLS and re-encrypts to the origin, which requires Cloudflare to present its own certificate — breaking the API Gateway setup. DNS-only mode (grey cloud) passes the connection straight through to API Gateway.
