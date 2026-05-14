# Milestone 2: Backend + Auth + Cloud Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud backend with Cognito auth, PostgreSQL storage via RDS, and a bidirectional offline-first sync layer to the existing PWA.

**Architecture:** Auth Lambda (outside VPC) handles token exchange via Cognito's Hosted UI; API Lambda (inside VPC) exposes a tRPC/Fastify router backed by Drizzle + RDS via RDS Proxy. Frontend stays fully functional offline; sync happens in a tiered background engine. JWT verification uses `aws-jwt-verify`'s caching JWKS fetcher, re-fetching via a Cognito VPC Interface Endpoint on key rotation — no NAT required.

**Tech Stack:** CDK v2, Drizzle ORM, Zod, tRPC v11, Fastify v5, `@fastify/aws-lambda`, `aws-jwt-verify`, TanStack Query v5, `@trpc/client`, `@trpc/react-query`

---

## How this plan is organised

Tasks are tagged **[EXTERNAL]** or **[CODEBASE]**:

- **[EXTERNAL]** — human action required in AWS Console, Google Cloud Console, Apple Developer Portal, or terminal with AWS credentials. No code produced.
- **[CODEBASE]** — produces commits. Can be done by an agent or developer with only this repo.

External tasks are grouped in Phase 0 (prerequisites) and Phase 6 (first deploy). Everything else is codebase work.

---

## File Map

### New directories
```
infra/                  CDK project (StorageStack + AppStack)
server/                 Lambda source (auth + api) + Drizzle
```

### New files
```
infra/package.json
infra/tsconfig.json
infra/cdk.json
infra/bin/app.ts
infra/lib/storage-stack.ts
infra/lib/app-stack.ts

server/package.json
server/tsconfig.json
server/drizzle.config.ts
server/db/schema.ts
server/db/index.ts
server/auth/index.ts
server/auth/routes.ts
server/auth/routes.test.ts
server/api/index.ts
server/api/context.ts
server/api/router.ts
server/api/routers/auth.ts
server/api/routers/auth.test.ts
server/api/routers/timers.ts
server/api/routers/timers.test.ts

src/lib/trpc.ts
src/hooks/useAuth.ts
src/components/LoginView.tsx
src/test/useAuth.test.ts
src/test/useSyncEngine.test.ts
src/test/db.migration.test.ts
```

### Modified files
```
src/db/schema.ts          add M2 fields + SYNC_STATUSES
src/db/index.ts           version 3 migration
src/hooks/useTimers.ts    tiered sync mutations
src/hooks/useSyncEngine.ts (new hook, listed above)
src/App.tsx               QueryClientProvider + auth gate + SyncEngineMount
package.json              add @tanstack/react-query, @trpc/client, @trpc/react-query, zod
```

---

## Phase 0: External Prerequisites [EXTERNAL]

These must be done before deploying. None produce code.

### Task 0.1: AWS account prerequisites

- [ ] Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- [ ] Run `aws configure` — enter Access Key ID, Secret, region (e.g. `us-east-1`), output `json`
- [ ] Install CDK: `npm install -g aws-cdk`
- [ ] Bootstrap the account (one-time): `cd infra && npx cdk bootstrap`

### Task 0.2: Google OAuth client

- [ ] Open Google Cloud Console → APIs & Services → Credentials
- [ ] Create OAuth 2.0 Client ID (Web application)
- [ ] Authorised redirect URIs: `https://<your-cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
- [ ] Note the **Client ID** and **Client Secret** — needed after CDK deploy (Task 6.2)

### Task 0.3: Apple Sign In (optional — skip if deferring Apple)

- [ ] Apple Developer Portal → Certificates, IDs & Profiles → Services IDs
- [ ] Create a new Services ID; enable Sign In with Apple
- [ ] Configure return URL: `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
- [ ] Create a Key (type: Sign In with Apple); download the `.p8` file
- [ ] Note: Team ID, Services ID, Key ID, `.p8` contents — needed at Task 6.2

---

## Phase 1: Repository & Package Setup [CODEBASE]

### Task 1.1: Initialise infra/ package

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`

- [ ] **Create `infra/package.json`**

```json
{
  "name": "counter-weight-infra",
  "private": true,
  "scripts": {
    "synth": "cdk synth",
    "diff:storage": "cdk diff StorageStack",
    "diff:app": "cdk diff AppStack",
    "deploy:storage": "cdk deploy StorageStack --require-approval never",
    "deploy:app": "cdk deploy AppStack --require-approval never"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.180.0",
    "constructs": "^10.0.0"
  },
  "devDependencies": {
    "aws-cdk": "^2.180.0",
    "ts-node": "^10.9.0",
    "typescript": "~5.7.0"
  }
}
```

- [ ] **Create `infra/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["bin", "lib"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Create `infra/cdk.json`**

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true
  }
}
```

- [ ] **Install infra dependencies**

```bash
cd infra && npm install
```

Expected: `node_modules/aws-cdk-lib` present.

- [ ] **Commit**

```bash
git add infra/package.json infra/package-lock.json infra/tsconfig.json infra/cdk.json
git commit -m "chore: initialise CDK infra package"
```

---

### Task 1.2: Initialise server/ package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/drizzle.config.ts`

- [ ] **Create `server/package.json`**

```json
{
  "name": "counter-weight-server",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@fastify/aws-lambda": "^4.0.0",
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@trpc/server": "^11.0.0",
    "aws-jwt-verify": "^4.0.0",
    "drizzle-orm": "^0.40.0",
    "fastify": "^5.0.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "~5.7.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["."],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Create `server/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Install server dependencies**

```bash
cd server && npm install
```

- [ ] **Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/drizzle.config.ts
git commit -m "chore: initialise server package (Lambda + tRPC + Drizzle)"
```

---

### Task 1.3: Add frontend dependencies

**Files:**
- Modify: `package.json`

- [ ] **Install frontend additions**

```bash
npm install @tanstack/react-query@^5.0.0 @trpc/client@^11.0.0 @trpc/react-query@^11.0.0 zod@^3.23.0
```

- [ ] **Verify packages were added to `package.json` dependencies**, then commit

```bash
git add package.json package-lock.json
git commit -m "chore: add TanStack Query and tRPC client dependencies"
```

---

## Phase 2: CDK Infrastructure [CODEBASE]

### Task 2.1: StorageStack

**Files:**
- Create: `infra/lib/storage-stack.ts`

- [ ] **Create `infra/lib/storage-stack.ts`**

```typescript
import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

export class StorageStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly dbProxy: rds.DatabaseProxy
  public readonly dbSecret: secretsmanager.ISecret
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
  public readonly cognitoDomainPrefix: string

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // VPC: private subnets only, no NAT
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    })

    // Cognito VPC Interface Endpoint — allows API Lambda to re-fetch JWKS
    // on key rotation without needing a NAT gateway. Private DNS resolves
    // cognito-idp.<region>.amazonaws.com to the private endpoint automatically.
    this.vpc.addInterfaceEndpoint('CognitoEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      privateDnsEnabled: true,
    })

    // RDS PostgreSQL
    const dbInstance = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      multiAz: false,
      storageEncrypted: true,
      deletionProtection: this.node.tryGetContext('env') === 'prod',
    })

    this.dbSecret = dbInstance.secret!

    // RDS Proxy — pools connections, prevents Lambda connection exhaustion
    this.dbProxy = new rds.DatabaseProxy(this, 'DbProxy', {
      proxyTargets: [rds.ProxyTarget.fromInstance(dbInstance)],
      secrets: [dbInstance.secret!],
      vpc: this.vpc,
      dbProxyName: 'counter-weight-proxy',
      requireTLS: true,
    })

    // Cognito User Pool
    this.cognitoDomainPrefix = 'counter-weight-auth'

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.cognitoDomainPrefix },
    })

    this.userPoolClient = this.userPool.addClient('AppClient', {
      generateSecret: true,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:5174/auth/callback',
          'https://counter-weight.app/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:5174',
          'https://counter-weight.app',
        ],
      },
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    })
    new cdk.CfnOutput(this, 'DbProxyEndpoint', {
      value: this.dbProxy.endpoint,
    })
  }
}
```

- [ ] **Commit**

```bash
git add infra/lib/storage-stack.ts
git commit -m "feat(infra): add StorageStack (VPC, RDS, RDS Proxy, Cognito, VPC endpoint)"
```

---

### Task 2.2: AppStack

**Files:**
- Create: `infra/lib/app-stack.ts`

- [ ] **Create `infra/lib/app-stack.ts`**

```typescript
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as path from 'path'
import { Construct } from 'constructs'
import type { StorageStack } from './storage-stack'

interface AppStackProps extends cdk.StackProps {
  storageStack: StorageStack
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const { storageStack } = props
    const region = this.region

    const cognitoDomain =
      `https://${storageStack.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`

    // Security group for API Lambda — allows outbound HTTPS to Cognito VPC endpoint
    const apiLambdaSg = new ec2.SecurityGroup(this, 'ApiLambdaSg', {
      vpc: storageStack.vpc,
      allowAllOutbound: false,
    })
    apiLambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS out')
    apiLambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Postgres out')

    // Auth Lambda — outside VPC, internet access for Cognito token endpoint
    const authLambda = new NodejsFunction(this, 'AuthLambda', {
      entry: path.join(__dirname, '../../server/auth/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_DOMAIN: cognitoDomain,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
        AUTH_CALLBACK_URL_PROD: 'https://counter-weight.app/auth/callback',
        AUTH_CALLBACK_URL_LOCAL: 'http://localhost:5174/auth/callback',
        // COGNITO_CLIENT_SECRET_ARN is the ARN of a Secrets Manager secret you create
        // manually after deploying StorageStack (see Task 6.2 manual steps).
        // Pass it as a CDK context value: cdk deploy --context cognitoClientSecretArn=<ARN>
        COGNITO_CLIENT_SECRET_ARN: this.node.getContext('cognitoClientSecretArn') as string,
      },
    })

    // API Lambda — inside VPC, reaches RDS via Proxy, reaches Cognito via VPC endpoint
    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      entry: path.join(__dirname, '../../server/api/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      vpc: storageStack.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [apiLambdaSg],
      environment: {
        COGNITO_USER_POOL_ID: storageStack.userPool.userPoolId,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
      },
    })

    // Grant API Lambda access to read the DB secret (for DATABASE_URL)
    storageStack.dbSecret.grantRead(apiLambda)
    storageStack.dbProxy.grantConnect(apiLambda, 'postgres')

    // Inject DATABASE_URL from proxy endpoint (read secret at Lambda init)
    apiLambda.addEnvironment('DB_PROXY_ENDPOINT', storageStack.dbProxy.endpoint)
    apiLambda.addEnvironment('DB_SECRET_ARN', storageStack.dbSecret.secretArn)

    // API Gateway HTTP API
    const api = new apigateway.HttpApi(this, 'Api', {
      apiName: 'counter-weight-api',
      corsPreflight: {
        allowOrigins: ['http://localhost:5174', 'https://counter-weight.app'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['content-type', 'authorization'],
        allowCredentials: true,
      },
    })

    api.addRoutes({
      path: '/auth/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('AuthIntegration', authLambda),
    })

    api.addRoutes({
      path: '/trpc/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', apiLambda),
    })

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint })
  }
}
```

- [ ] **Commit**

```bash
git add infra/lib/app-stack.ts
git commit -m "feat(infra): add AppStack (Auth Lambda, API Lambda, API Gateway)"
```

---

### Task 2.3: CDK entry point

**Files:**
- Create: `infra/bin/app.ts`

- [ ] **Create `infra/bin/app.ts`**

```typescript
import * as cdk from 'aws-cdk-lib'
import { StorageStack } from '../lib/storage-stack'
import { AppStack } from '../lib/app-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
}

const storageStack = new StorageStack(app, 'StorageStack', { env })
new AppStack(app, 'AppStack', { storageStack, env })
```

- [ ] **Validate CDK synth produces no errors**

```bash
cd infra && npm run synth
```

Expected: CloudFormation template printed to stdout with no errors. Two stacks: `StorageStack` and `AppStack`.

- [ ] **Commit**

```bash
git add infra/bin/app.ts
git commit -m "feat(infra): add CDK entry point, wire StorageStack → AppStack"
```

---

## Phase 3: Server Database [CODEBASE]

### Task 3.1: Drizzle schema

**Files:**
- Create: `server/db/schema.ts`

- [ ] **Create `server/db/schema.ts`**

```typescript
import {
  pgTable, pgEnum, text, uuid, timestamp, integer, boolean, jsonb, index,
} from 'drizzle-orm/pg-core'

export const timerStatusEnum = pgEnum('timer_status', [
  'active', 'fired', 'completed', 'missed', 'cancelled',
])
export const priorityEnum = pgEnum('priority', [
  'low', 'medium', 'high', 'critical',
])
export const eventTypeEnum = pgEnum('event_type', [
  'created', 'updated', 'rescheduled', 'completed', 'cancelled',
])

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Cognito sub
  email: text('email').notNull(),
  settings: jsonb('settings').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const timers = pgTable(
  'timers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    groupId: uuid('group_id'), // no FK until M4
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    targetDatetime: timestamp('target_datetime', { withTimezone: true }).notNull(),
    originalTargetDatetime: timestamp('original_target_datetime', { withTimezone: true }).notNull(),
    status: timerStatusEnum('status').notNull().default('active'),
    priority: priorityEnum('priority').notNull().default('medium'),
    isFlagged: boolean('is_flagged').notNull().default(false),
    recurrenceRule: jsonb('recurrence_rule'),
    eventbridgeScheduleId: text('eventbridge_schedule_id'), // M3 populates this
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timers_user_status_idx').on(t.userId, t.status),
    index('timers_updated_at_idx').on(t.updatedAt),
  ],
)

export const timerEvents = pgTable('timer_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  timerId: uuid('timer_id').notNull().references(() => timers.id),
  userId: text('user_id').notNull().references(() => users.id),
  eventType: eventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').default('{}'),
})
```

- [ ] **Commit**

```bash
git add server/db/schema.ts
git commit -m "feat(server): add Drizzle schema (users, timers, timer_events)"
```

---

### Task 3.2: Drizzle client factory

**Files:**
- Create: `server/db/index.ts`

- [ ] **Create `server/db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 1 }) // max 1 for Lambda
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
```

- [ ] **Commit**

```bash
git add server/db/index.ts
git commit -m "feat(server): add Drizzle client factory"
```

---

### Task 3.3: Generate and commit initial migration

Requires a running local Postgres. Run this once before deploying.

- [ ] **Start a local Postgres (Docker)**

```bash
docker run --rm -d \
  --name cw-postgres \
  -e POSTGRES_DB=counter_weight \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16
```

- [ ] **Generate the migration**

```bash
cd server && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/counter_weight npm run migrate
```

Expected: `server/db/migrations/0000_initial.sql` created.

- [ ] **Stop local Postgres**

```bash
docker stop cw-postgres
```

- [ ] **Commit the generated migration**

```bash
git add server/db/migrations/
git commit -m "feat(server): add initial Drizzle migration (users, timers, timer_events)"
```

---

## Phase 4: Auth Lambda [CODEBASE]

### Task 4.1: Auth routes (with tests)

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

function cognitoBasicAuth() {
  return `Basic ${Buffer.from(
    `${process.env.COGNITO_CLIENT_ID}:${process.env.COGNITO_CLIENT_SECRET}`,
  ).toString('base64')}`
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
        Authorization: cognitoBasicAuth(),
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
        Authorization: cognitoBasicAuth(),
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

### Task 4.2: Auth Lambda handler

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

---

## Phase 5: API Lambda [CODEBASE]

### Task 5.1: tRPC context (JWT verification)

**Files:**
- Create: `server/api/context.ts`

- [ ] **Create `server/api/context.ts`**

`aws-jwt-verify` caches JWKS in memory after the first fetch. With the Cognito VPC Interface Endpoint having `privateDnsEnabled: true`, the Lambda's DNS resolves `cognito-idp.<region>.amazonaws.com` to the private endpoint automatically — no code change needed.

```typescript
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { FastifyRequest } from 'fastify'
import { createDb } from '../db/index.js'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { Db } from '../db/index.js'

let _db: Db | null = null

async function getDb(): Promise<Db> {
  if (_db) return _db

  const sm = new SecretsManagerClient({})
  const secret = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }),
  )
  const { username, password, host, port, dbname } = JSON.parse(
    secret.SecretString!,
  )
  const proxyEndpoint = process.env.DB_PROXY_ENDPOINT!
  const url = `postgresql://${username}:${encodeURIComponent(password)}@${proxyEndpoint}:${port}/${dbname}?sslmode=require`

  _db = createDb(url)
  return _db
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
})

export async function createContext({ req }: { req: FastifyRequest }) {
  const db = await getDb()
  const auth = req.headers.authorization

  if (!auth?.startsWith('Bearer ')) return { userId: null, db }

  try {
    const payload = await verifier.verify(auth.slice(7))
    return { userId: payload.sub as string, db }
  } catch {
    return { userId: null, db }
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
```

- [ ] **Commit**

```bash
git add server/api/context.ts
git commit -m "feat(server): add tRPC context with JWKS caching JWT verification"
```

---

### Task 5.2: tRPC router + middleware

**Files:**
- Create: `server/api/router.ts`

- [ ] **Create `server/api/router.ts`**

```typescript
import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context.js'

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})
```

- [ ] **Commit**

```bash
git add server/api/router.ts
git commit -m "feat(server): add tRPC init with protectedProcedure middleware"
```

---

### Task 5.3: auth.bootstrap procedure (with test)

**Files:**
- Create: `server/api/routers/auth.ts`
- Create: `server/api/routers/auth.test.ts`

- [ ] **Write the failing test**

Create `server/api/routers/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createCallerFactory, TRPCError } from '@trpc/server'
import { authRouter } from './auth.js'
import { router } from '../router.js'

const testRouter = router({ auth: authRouter })
const createCaller = createCallerFactory(testRouter)

function makeCtx(userId: string | null, dbValues?: any[]) {
  const mockReturning = vi.fn().mockResolvedValue(dbValues ?? [])
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue([]) })
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

  return { userId, db: { insert: mockInsert } as any }
}

describe('auth.bootstrap', () => {
  it('throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createCaller(makeCtx(null))
    await expect(
      caller.auth.bootstrap({ email: 'user@example.com' }),
    ).rejects.toThrow(TRPCError)
  })

  it('upserts the user row when authenticated', async () => {
    const ctx = makeCtx('user-sub-123')
    const caller = createCaller(ctx)
    const result = await caller.auth.bootstrap({ email: 'user@example.com' })
    expect(result).toEqual({ ok: true })
    expect(ctx.db.insert).toHaveBeenCalled()
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
cd server && npm test -- server/api/routers/auth.test.ts
```

- [ ] **Create `server/api/routers/auth.ts`**

```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../router.js'
import { users } from '../../db/schema.js'

export const authRouter = router({
  bootstrap: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(users)
        .values({ id: ctx.userId, email: input.email })
        .onConflictDoUpdate({ target: users.id, set: { email: input.email } })
      return { ok: true }
    }),
})
```

- [ ] **Run — expect PASS**

```bash
cd server && npm test -- server/api/routers/auth.test.ts
```

- [ ] **Commit**

```bash
git add server/api/routers/auth.ts server/api/routers/auth.test.ts
git commit -m "feat(server): add auth.bootstrap tRPC procedure"
```

---

### Task 5.4: timers CRUD procedures (with tests)

**Files:**
- Create: `server/api/routers/timers.ts`
- Create: `server/api/routers/timers.test.ts`

- [ ] **Write the failing tests**

Create `server/api/routers/timers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createCallerFactory, TRPCError } from '@trpc/server'
import { timersRouter } from './timers.js'
import { router } from '../router.js'

const testRouter = router({ timers: timersRouter })
const createCaller = createCallerFactory(testRouter)

const BASE_INPUT = {
  serverId: null as string | null,
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: '2026-06-01T12:00:00Z',
  originalTargetDatetime: '2026-06-01T12:00:00Z',
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  recurrenceRule: null,
  version: undefined as number | undefined,
}

function mockInsertChain(returning: any[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  return { insert: vi.fn().mockReturnValue({ values: mockValues }) }
}

function mockSelectChain(rows: any[]) {
  const mockWhere = vi.fn().mockResolvedValue(rows)
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  return { select: vi.fn().mockReturnValue({ from: mockFrom }) }
}

describe('timers.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller({ userId: null, db: {} as any })
    await expect(caller.timers.upsert(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('creates a new server timer when serverId is null', async () => {
    const insertDb = mockInsertChain([{ serverId: 'srv-uuid', version: 1 }])
    // Second insert is for timer_events — mock it too
    let callCount = 0
    const insertMock = vi.fn().mockImplementation(() => {
      const returning = callCount++ === 0
        ? vi.fn().mockResolvedValue([{ serverId: 'srv-uuid', version: 1 }])
        : vi.fn().mockResolvedValue([])
      const values = vi.fn().mockReturnValue({ returning })
      return { values }
    })

    const caller = createCaller({ userId: 'u1', db: { insert: insertMock } as any })
    const result = await caller.timers.upsert(BASE_INPUT)

    expect(result.serverId).toBe('srv-uuid')
    expect(result.version).toBe(1)
    expect(insertMock).toHaveBeenCalledTimes(2) // timers + timer_events
  })

  it('throws CONFLICT when client version does not match server version', async () => {
    const existingRow = [{ version: 5 }]
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(existingRow),
      }),
    })

    const caller = createCaller({
      userId: 'u1',
      db: { select: selectMock } as any,
    })

    await expect(
      caller.timers.upsert({ ...BASE_INPUT, serverId: 'existing-uuid', version: 3 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('timers.complete', () => {
  it('throws CONFLICT when version mismatches', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ version: 2 }]),
      }),
    })

    const caller = createCaller({ userId: 'u1', db: { select: selectMock } as any })
    await expect(
      caller.timers.complete({ serverId: 'srv-uuid', version: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
cd server && npm test -- server/api/routers/timers.test.ts
```

- [ ] **Create `server/api/routers/timers.ts`**

```typescript
import { z } from 'zod'
import { and, eq, gt, ne } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'
import { timers, timerEvents } from '../../db/schema.js'

const timerUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  targetDatetime: z.string().datetime(),
  originalTargetDatetime: z.string().datetime(),
  status: z.enum(['active', 'fired', 'completed', 'missed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  isFlagged: z.boolean(),
  recurrenceRule: z.object({ cron: z.string(), tz: z.string() }).nullable(),
  version: z.number().int().optional(),
})

export const timersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(timers)
      .where(and(eq(timers.userId, ctx.userId), ne(timers.status, 'cancelled')))
  }),

  get: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [timer] = await ctx.db
        .select()
        .from(timers)
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))
      return timer ?? null
    }),

  upsert: protectedProcedure
    .input(timerUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        // Update existing — check version for optimistic concurrency
        const [existing] = await ctx.db
          .select({ version: timers.version })
          .from(timers)
          .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))

        if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
        if (input.version !== undefined && existing.version !== input.version) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch' })
        }

        const [updated] = await ctx.db
          .update(timers)
          .set({
            title: input.title,
            description: input.description,
            emoji: input.emoji,
            targetDatetime: new Date(input.targetDatetime),
            status: input.status,
            priority: input.priority,
            isFlagged: input.isFlagged,
            recurrenceRule: input.recurrenceRule,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))
          .returning({ serverId: timers.id, version: timers.version })

        return updated
      }

      // Create new timer
      const [created] = await ctx.db
        .insert(timers)
        .values({
          userId: ctx.userId,
          title: input.title,
          description: input.description,
          emoji: input.emoji,
          targetDatetime: new Date(input.targetDatetime),
          originalTargetDatetime: new Date(input.originalTargetDatetime),
          status: input.status,
          priority: input.priority,
          isFlagged: input.isFlagged,
          recurrenceRule: input.recurrenceRule,
        })
        .returning({ serverId: timers.id, version: timers.version })

      await ctx.db.insert(timerEvents).values({
        timerId: created.serverId,
        userId: ctx.userId,
        eventType: 'created',
      })

      return created
    }),

  complete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ version: timers.version })
        .from(timers)
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.version !== input.version) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db
        .update(timers)
        .set({ status: 'completed', version: existing.version + 1, updatedAt: new Date() })
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'completed',
      })

      return { ok: true }
    }),

  cancel: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ version: timers.version })
        .from(timers)
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.version !== input.version) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db
        .update(timers)
        .set({ status: 'cancelled', version: existing.version + 1, updatedAt: new Date() })
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'cancelled',
      })

      return { ok: true }
    }),

  reconcile: protectedProcedure
    .input(
      z.object({
        since: z.string().datetime().nullable(),
        records: z.array(
          z.object({ serverId: z.string().uuid(), updatedAt: z.string().datetime() }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(timers.userId, ctx.userId)]
      if (input.since) conditions.push(gt(timers.updatedAt, new Date(input.since)))

      const serverRecords = await ctx.db
        .select()
        .from(timers)
        .where(and(...conditions))

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      return serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })
    }),
})
```

- [ ] **Run tests — expect PASS**

```bash
cd server && npm test -- server/api/routers/timers.test.ts
```

- [ ] **Commit**

```bash
git add server/api/routers/timers.ts server/api/routers/timers.test.ts
git commit -m "feat(server): add timer CRUD + reconcile tRPC procedures"
```

---

### Task 5.5: API Lambda handler + root router

**Files:**
- Create: `server/api/index.ts`

- [ ] **Create `server/api/index.ts`**

```typescript
import Fastify from 'fastify'
import awsLambdaFastify from '@fastify/aws-lambda'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { createContext } from './context.js'
import { authRouter } from './routers/auth.js'
import { timersRouter } from './routers/timers.js'
import { router } from './router.js'

export const appRouter = router({
  auth: authRouter,
  timers: timersRouter,
})

export type AppRouter = typeof appRouter

const app = Fastify({ logger: true })

app.register(cors, {
  origin: ['http://localhost:5174', 'https://counter-weight.app'],
  credentials: true,
})

app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
})

export const handler = awsLambdaFastify(app)
```

- [ ] **Verify TypeScript compiles without errors**

```bash
cd server && npm run typecheck
```

Expected: no output (no errors).

- [ ] **Commit**

```bash
git add server/api/index.ts
git commit -m "feat(server): add API Lambda handler with tRPC adapter"
```

---

## Phase 6: First Deploy [EXTERNAL + CODEBASE commands]

**Deploy order is strict: migrations before Lambda code.**

### Task 6.1: Deploy StorageStack

- [ ] **Deploy StorageStack** (takes ~15 min for RDS)

```bash
cd infra && npm run deploy:storage
```

Expected output: `StorageStack` successfully deployed. Note the outputs:
- `UserPoolId`
- `UserPoolClientId`
- `DbProxyEndpoint`

### Task 6.2: Configure Cognito federation providers [EXTERNAL]

> **Sequencing note:** `selfSignUpEnabled: false` is set in StorageStack, which means the User Pool has no usable identity providers until this task is complete. No end-to-end auth testing is possible until Task 6.2 is done and AppStack is redeployed (Task 6.4). Complete this task before attempting any login flow.

- [ ] In AWS Console → Cognito → User Pools → your pool → Sign-in experience → Federated identity providers
- [ ] Add Google: paste Client ID and Client Secret from Task 0.2
- [ ] (Optional) Add Apple: paste Team ID, Services ID, Key ID, and `.p8` private key from Task 0.3
- [ ] In the App client settings, enable Google (and Apple) as identity providers

### Task 6.3: Store Cognito client secret + run migrations [EXTERNAL]

- [ ] **Fetch the Cognito client secret** (needed by Auth Lambda at runtime)

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id <UserPoolId from outputs> \
  --client-id <UserPoolClientId from outputs> \
  --query 'UserPoolClient.ClientSecret' \
  --output text
```

- [ ] **Store it in Secrets Manager** (Auth Lambda reads it at cold start)

```bash
aws secretsmanager create-secret \
  --name counter-weight/cognito-client-secret \
  --secret-string "<secret from above>"
```

- [ ] **Start a bastion or use VPC endpoints** to run migrations. Since RDS is in a private subnet with no public access, use AWS Cloud9, a Lambda invocation, or an SSM port-forward to reach it.

  Simplest approach — SSM port-forward via a temporary EC2 in the VPC:

```bash
# Or use the RDS Data API if you prefer a serverless alternative
DATABASE_URL=postgresql://postgres:<password>@<DbProxyEndpoint>:5432/postgres \
  cd server && npm run migrate
```

- [ ] **Verify migration ran**

```bash
# Should show tables: users, timers, timer_events
psql $DATABASE_URL -c "\dt"
```

### Task 6.4: Deploy AppStack

- [ ] **Add `COGNITO_CLIENT_SECRET_ARN` to AppStack environment** (update `app-stack.ts` with the actual ARN from 6.3, or pass it as a CDK context value)
- [ ] **Deploy AppStack**

```bash
cd infra && npm run deploy:app
```

Expected: `ApiUrl` output — e.g. `https://abc123.execute-api.us-east-1.amazonaws.com`

- [ ] **Smoke-test the auth endpoint**

```bash
curl -X POST https://abc123.execute-api.us-east-1.amazonaws.com/auth/refresh
```

Expected: `{"error":"No refresh token"}` (401) — Lambda is live.

---

## Phase 7: Frontend Dexie Migration [CODEBASE]

### Task 7.1: Update Timer schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Write the migration test first**

Create `src/test/db.migration.test.ts`:

```typescript
import 'fake-indexeddb/auto'
import { db } from '../db'

describe('Dexie v3 migration', () => {
  it('existing timers get M2 default fields after migration', async () => {
    // Simulate a pre-migration record by writing a raw object
    // (version 3 migration runs automatically on db open in fake-indexeddb)
    const id = await db.timers.add({
      title: 'Pre-migration timer',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      // M2 fields come from migration defaults
      serverId: null,
      userId: null,
      syncStatus: 'synced',
      version: null,
    } as any)

    const timer = await db.timers.get(id)
    expect(timer?.serverId).toBeNull()
    expect(timer?.userId).toBeNull()
    expect(timer?.syncStatus).toBe('synced')
    expect(timer?.version).toBeNull()
  })
})
```

- [ ] **Run — expect FAIL (M2 fields don't exist yet)**

```bash
npx vitest run src/test/db.migration.test.ts
```

- [ ] **Update `src/db/schema.ts`** — add M2 fields and SYNC_STATUSES

```typescript
export const SYNC_STATUSES = ['pending', 'synced'] as const
export type SyncStatus = typeof SYNC_STATUSES[number]

export interface Timer {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
  // M2 sync fields
  serverId: string | null
  userId: string | null
  syncStatus: SyncStatus
  version: number | null
}
```

(Keep all existing exports above the Timer interface — add SYNC_STATUSES before it.)

- [ ] **Update `src/db/index.ts`** — add version 3 migration

```typescript
this.version(3).stores({
  timers: '++id, status, targetDatetime, priority, isFlagged, groupId, syncStatus, serverId, userId',
}).upgrade(tx =>
  tx.table('timers').toCollection().modify(timer => {
    timer.serverId = timer.serverId ?? null
    timer.userId = timer.userId ?? null
    timer.syncStatus = timer.syncStatus ?? 'synced'
    timer.version = timer.version ?? null
  })
)
```

- [ ] **Run migration test — expect PASS**

```bash
npx vitest run src/test/db.migration.test.ts
```

- [ ] **Run full test suite — ensure no regressions**

```bash
npx vitest run
```

- [ ] **Fix any tests that break** — existing test fixtures need the new required fields. Update `BASE` object in `src/test/useTimers.test.ts` and the `db.test.ts` fixture objects to include:

```typescript
serverId: null,
userId: null,
syncStatus: 'synced' as const,
version: null,
```

Also update `createTimer` in `src/hooks/useTimers.ts` to include defaults for M2 fields:

```typescript
export async function createTimer(
  data: Omit<Timer, 'id' | 'createdAt' | 'updatedAt' | 'originalTargetDatetime' | 'serverId' | 'userId' | 'syncStatus' | 'version'>,
): Promise<number | undefined> {
  const now = new Date()
  return db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId: null,
    syncStatus: 'synced',
    version: null,
  })
}
```

- [ ] **Run full suite again — all green**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/hooks/useTimers.ts src/test/
git commit -m "feat(frontend): Dexie v3 migration adds serverId, userId, syncStatus, version"
```

---

## Phase 8: Frontend Auth [CODEBASE]

### Task 8.1: tRPC client

**Files:**
- Create: `src/lib/trpc.ts`

- [ ] **Create `src/lib/trpc.ts`**

The tRPC client injects the Bearer token and retries once on 401 by calling `/auth/refresh`.

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/api/index'

export let idToken: string | null = null

export function setIdToken(token: string | null) {
  idToken = token
}

async function refreshAndRetry(url: RequestInfo, options: RequestInit): Promise<Response> {
  const refreshRes = await fetch('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })

  if (!refreshRes.ok) {
    setIdToken(null)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { idToken: newToken } = (await refreshRes.json()) as { idToken: string }
  setIdToken(newToken)

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${newToken}`)
  return fetch(url, { ...options, headers })
}

async function fetchWithAuth(url: RequestInfo, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, options)
  if (res.status === 401 && idToken) return refreshAndRetry(url, options)
  return res
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      fetch: fetchWithAuth,
      headers() {
        return idToken ? { Authorization: `Bearer ${idToken}` } : {}
      },
    }),
  ],
})
```

- [ ] **Commit**

```bash
git add src/lib/trpc.ts
git commit -m "feat(frontend): add tRPC client with Bearer token + 401 retry"
```

---

### Task 8.2: useAuth hook (with test)

**Files:**
- Create: `src/hooks/useAuth.ts`
- Create: `src/test/useAuth.test.ts`

- [ ] **Write the failing tests**

Create `src/test/useAuth.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../hooks/useAuth'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Minimal fake JWT: header.payload.sig where payload has sub and email
function fakeJwt(sub: string, email: string) {
  const payload = btoa(JSON.stringify({ sub, email }))
  return `header.${payload}.sig`
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('import.meta', {
    env: {
      VITE_COGNITO_DOMAIN: 'https://test.auth.us-east-1.amazoncognito.com',
      VITE_COGNITO_CLIENT_ID: 'test-client-id',
    },
  })
})

describe('useAuth', () => {
  it('starts in loading state, transitions to authenticated after successful silent refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idToken: fakeJwt('user-sub', 'user@example.com') }),
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.state).toBe('loading')

    await waitFor(() => expect(result.current.state).toBe('authenticated'))

    expect(result.current.user?.userId).toBe('user-sub')
    expect(result.current.user?.email).toBe('user@example.com')
  })

  it('transitions to unauthenticated when silent refresh returns 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.state).toBe('unauthenticated'))
    expect(result.current.user).toBeNull()
  })

  it('transitions to unauthenticated on refresh timeout (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.state).toBe('unauthenticated'))
  })

  it('logout clears user state, calls /auth/logout, and removes lastSyncedAt', async () => {
    localStorage.setItem('cw:lastSyncedAt', new Date().toISOString())
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: fakeJwt('user-sub', 'user@example.com') }),
      })
      .mockResolvedValueOnce({ ok: true }) // logout call

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state).toBe('authenticated'))

    await act(async () => { await result.current.logout() })

    expect(result.current.state).toBe('unauthenticated')
    expect(result.current.user).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }))
    expect(localStorage.getItem('cw:lastSyncedAt')).toBeNull()
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
npx vitest run src/test/useAuth.test.ts
```

- [ ] **Create `src/hooks/useAuth.ts`**

```typescript
import { useState, useEffect, useRef } from 'react'
import { setIdToken } from '../lib/trpc'

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export interface AuthUser {
  userId: string
  email: string
}

export interface UseAuth {
  state: AuthState
  user: AuthUser | null
  login: () => void
  logout: () => Promise<void>
}

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeout)
        if (!res.ok) { setState('unauthenticated'); return }
        const { idToken } = (await res.json()) as { idToken: string }
        setIdToken(idToken)
        const u = parseJwt(idToken)
        setUser(u)
        setState(u ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        clearTimeout(timeout)
        setState('unauthenticated')
      })
  }, [])

  function login() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'email openid profile',
    })
    window.location.href = `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/authorize?${params}`
  }

  async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    setIdToken(null)
    setUser(null)
    setState('unauthenticated')
    localStorage.removeItem('cw:lastSyncedAt')
  }

  return { state, user, login, logout }
}
```

- [ ] **Run tests — expect PASS**

```bash
npx vitest run src/test/useAuth.test.ts
```

- [ ] **Commit**

```bash
git add src/hooks/useAuth.ts src/test/useAuth.test.ts
git commit -m "feat(frontend): add useAuth hook with 3s silent refresh timeout"
```

---

### Task 8.3: LoginView component

**Files:**
- Create: `src/components/LoginView.tsx`

- [ ] **Create `src/components/LoginView.tsx`**

```tsx
interface LoginViewProps {
  onLogin: () => void
}

export function LoginView({ onLogin }: LoginViewProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Counter Weight</h1>
        <p className="text-slate-400 text-sm">Sign in to sync your timers across devices</p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-6 rounded-xl active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>
      </div>

      <p className="text-slate-600 text-xs text-center">
        Your timers are stored locally and sync when you're online
      </p>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/components/LoginView.tsx
git commit -m "feat(frontend): add LoginView component"
```

---

### Task 8.4: App.tsx — auth gate + QueryClientProvider

**Files:**
- Modify: `src/App.tsx`

- [ ] **Add auth handling and the callback route to `src/App.tsx`**

Add these imports at the top:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import { LoginView } from './components/LoginView'
import { trpc } from './lib/trpc'
```

Add `const queryClient = new QueryClient()` above the `App` function.

Wrap the return value in `<QueryClientProvider client={queryClient}>`.

Inside `App`, add auth handling:

```tsx
const { state, user, login } = useAuth()

// Handle Cognito auth callback
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return

  window.history.replaceState({}, '', window.location.pathname)

  fetch('/auth/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code, origin: window.location.origin }),
  })
    .then(async (res) => {
      if (!res.ok) return
      const { idToken } = await res.json() as { idToken: string }
      // Reload triggers useAuth's silent refresh, which restores authenticated state.
      // Known limitation (M2): causes a visible roundtrip. Fixing cleanly requires a
      // shared auth store so the callback can update auth state in place. Defer to M3.
      setIdToken(idToken)
      window.location.reload()
    })
}, [])
```

In `renderContent()`, add the auth gate before the existing switch:

```tsx
if (state === 'loading') {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
    </div>
  )
}

if (state === 'unauthenticated') {
  return <LoginView onLogin={login} />
}
```

Also: after login is confirmed, call `auth.bootstrap`:

```tsx
useEffect(() => {
  if (state !== 'authenticated' || !user) return
  trpc.auth.bootstrap.mutate({ email: user.email })
}, [state, user?.userId])
```

- [ ] **Run full test suite**

```bash
npx vitest run
```

- [ ] **Start dev server and verify login page renders**

```bash
npm run dev
```

Navigate to `http://localhost:5174` — should show the LoginView (since no refresh token exists yet).

- [ ] **Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): add auth gate, QueryClientProvider, Cognito callback handler"
```

---

## Phase 9: Frontend Sync Engine [CODEBASE]

### Task 9.1: useSyncEngine hook (with test)

**Files:**
- Create: `src/hooks/useSyncEngine.ts`
- Create: `src/test/useSyncEngine.test.ts`

- [ ] **Write the failing tests**

Create `src/test/useSyncEngine.test.ts`:

```typescript
import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { useSyncEngine } from '../hooks/useSyncEngine'
import type { AuthUser } from '../hooks/useAuth'

// Mock the tRPC client
vi.mock('../lib/trpc', () => ({
  trpc: {
    timers: {
      upsert: { mutate: vi.fn() },
      list: { query: vi.fn() },
      reconcile: { query: vi.fn() },
    },
  },
  idToken: 'mock-token',
  setIdToken: vi.fn(),
}))

import { trpc } from '../lib/trpc'

const USER: AuthUser = { userId: 'user-1', email: 'user@example.com' }

const BASE_TIMER = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-1',
  version: null,
}

beforeEach(async () => {
  await db.timers.clear()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useSyncEngine', () => {
  it('drains pending timers and marks them synced on success', async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: 'pending',
    })

    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce({
      serverId: 'srv-uuid',
      version: 1,
    })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.syncStatus).toBe('synced')
      expect(timer?.serverId).toBe('srv-uuid')
    })
  })

  it('overwrites Dexie with server record on 409 conflict and logs it', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: 'existing-srv',
      syncStatus: 'pending',
      version: 1,
    })

    const conflictError = Object.assign(new Error('Conflict'), {
      data: { code: 'CONFLICT' },
    })
    vi.mocked(trpc.timers.upsert.mutate).mockRejectedValueOnce(conflictError)
    vi.mocked(trpc.timers.get.query).mockResolvedValueOnce({
      id: 'existing-srv',
      title: 'Server version',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      recurrenceRule: null,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      groupId: null,
      eventbridgeScheduleId: null,
    })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.title).toBe('Server version')
      expect(timer?.syncStatus).toBe('synced')
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[conflict] overwriting local timer',
      expect.objectContaining({ timerId: id, userId: 'user-1' }),
    )
  })

  it('does nothing when user is null', () => {
    renderHook(() => useSyncEngine({ user: null }))
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
npx vitest run src/test/useSyncEngine.test.ts
```

- [ ] **Create `src/hooks/useSyncEngine.ts`**

```typescript
import { useEffect, useRef } from 'react'
import { db } from '../db'
import { trpc } from '../lib/trpc'
import type { AuthUser } from './useAuth'

const LAST_SYNCED_KEY = 'cw:lastSyncedAt'

type ServerTimer = Awaited<ReturnType<typeof trpc.timers.list.query>>[number]

function mapServerTimer(s: ServerTimer) {
  return {
    serverId: s.id,
    title: s.title,
    description: s.description,
    emoji: s.emoji,
    targetDatetime: new Date(s.targetDatetime),
    originalTargetDatetime: new Date(s.originalTargetDatetime),
    status: s.status,
    priority: s.priority,
    isFlagged: s.isFlagged,
    recurrenceRule: s.recurrenceRule as { cron: string; tz: string } | null,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    groupId: null,
    syncStatus: 'synced' as const,
  }
}

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  const runningRef = useRef(false)

  useEffect(() => {
    if (!user) return

    async function drainPending() {
      const pending = await db.timers
        .where('syncStatus')
        .equals('pending')
        .and((t) => t.userId === user!.userId)
        .toArray()

      for (const timer of pending) {
        try {
          const result = await trpc.timers.upsert.mutate({
            serverId: timer.serverId,
            title: timer.title,
            description: timer.description,
            emoji: timer.emoji,
            targetDatetime: timer.targetDatetime.toISOString(),
            originalTargetDatetime: timer.originalTargetDatetime.toISOString(),
            status: timer.status,
            priority: timer.priority,
            isFlagged: timer.isFlagged,
            recurrenceRule: timer.recurrenceRule,
            version: timer.version ?? undefined,
          })
          await db.timers.update(timer.id!, {
            serverId: result.serverId,
            syncStatus: 'synced',
            version: result.version,
          })
        } catch (err: unknown) {
          const code = (err as { data?: { code?: string } })?.data?.code
          if (code === 'CONFLICT' && timer.serverId) {
            // Server wins: fetch the single conflicting record and overwrite Dexie
            const match = await trpc.timers.get.query({ serverId: timer.serverId })
            if (match) {
              console.warn('[conflict] overwriting local timer', {
                timerId: timer.id,
                userId: user!.userId,
                localVersion: timer.version,
                serverVersion: match.version,
              })
              await db.timers.update(timer.id!, {
                ...mapServerTimer(match),
                syncStatus: 'synced',
              })
            }
          }
          // Other errors: leave pending, retry on next sync
        }
      }
    }

    async function reconcile() {
      const lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY)
      const localTimers = await db.timers
        .where('userId')
        .equals(user!.userId)
        .toArray()

      const records = localTimers
        .filter((t) => t.serverId)
        .map((t) => ({ serverId: t.serverId!, updatedAt: t.updatedAt.toISOString() }))

      const stale = await trpc.timers.reconcile.query({ since: lastSyncedAt, records })

      for (const serverTimer of stale) {
        const local = localTimers.find((t) => t.serverId === serverTimer.id)
        if (local?.id !== undefined) {
          await db.timers.update(local.id, {
            ...mapServerTimer(serverTimer),
            syncStatus: 'synced',
          })
        } else {
          await db.timers.add({
            ...mapServerTimer(serverTimer),
            userId: user!.userId,
            syncStatus: 'synced',
          })
        }
      }

      localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString())
    }

    async function sync() {
      if (runningRef.current) return
      runningRef.current = true
      try {
        await drainPending()
        await reconcile()
      } finally {
        runningRef.current = false
      }
    }

    sync()

    function onOnline() { sync() }
    function onVisibility() { if (document.visibilityState === 'visible') sync() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user?.userId])
}
```

- [ ] **Run tests — expect PASS**

```bash
npx vitest run src/test/useSyncEngine.test.ts
```

- [ ] **Run full suite**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/hooks/useSyncEngine.ts src/test/useSyncEngine.test.ts
git commit -m "feat(frontend): add useSyncEngine (drain pending, pull on reconnect, reconcile)"
```

---

### Task 9.2: Tiered mutations in useTimers.ts

**Files:**
- Modify: `src/hooks/useTimers.ts`

The spec defines two tiers:
- **Critical** (create, reschedule/edit, complete, cancel): Dexie write + concurrent server mutation
- **Deferred** (rename, emoji, flag, priority): Dexie write, set `syncStatus: 'pending'`

Currently `editTimer` covers both reschedule and non-critical field changes. We need to split these or handle them in the server sync based on what changed.

The simplest approach without restructuring `editTimer`: after each critical Dexie write, fire the tRPC mutation concurrently (don't await). On success, update `serverId` and `version` in Dexie. On 409, let `useSyncEngine` handle it on next sync.

- [ ] **Update `src/hooks/useTimers.ts`**

Replace the file content:

```typescript
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Priority, Timer } from '../db/schema'
import { HISTORY_STATUSES } from '../db/schema'
import { trpc } from '../lib/trpc'

export function useActiveTimers(): Timer[] {
  return (
    useLiveQuery(
      () => db.timers.where('status').equals('active').sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useFeedTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf('active', 'fired')
          .sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useHistoryTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf(...HISTORY_STATUSES)
          .toArray()
          .then((arr) =>
            arr.sort(
              (a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime(),
            ),
          ),
      [],
      [],
    ) ?? []
  )
}

export async function createTimer(
  data: Omit<
    Timer,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'originalTargetDatetime'
    | 'serverId'
    | 'userId'
    | 'syncStatus'
    | 'version'
  >,
  userId: string | null,
): Promise<number | undefined> {
  const now = new Date()
  const id = await db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId,
    syncStatus: userId ? 'pending' : 'synced',
    version: null,
  })

  if (userId && id !== undefined) {
    // Concurrent server sync — don't block the UI
    trpc.timers.upsert
      .mutate({
        serverId: null,
        title: data.title,
        description: data.description,
        emoji: data.emoji,
        targetDatetime: data.targetDatetime.toISOString(),
        originalTargetDatetime: data.targetDatetime.toISOString(),
        status: data.status,
        priority: data.priority,
        isFlagged: data.isFlagged,
        recurrenceRule: data.recurrenceRule,
      })
      .then((result) => {
        db.timers.update(id, {
          serverId: result.serverId,
          syncStatus: 'synced',
          version: result.version,
        })
      })
      .catch(() => {
        // Stays pending — useSyncEngine drains on reconnect
      })
  }

  return id
}

export async function completeTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'completed', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.complete
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  }
}

export async function cancelTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'cancelled', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.cancel
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  }
}

export async function editTimer(
  id: number,
  params: {
    targetDatetime: Date
    title: string
    emoji: string | null
    priority: Priority
  },
) {
  const current = await db.timers.get(id)
  if (!current) return

  const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime
  const isExtending = params.targetDatetime > current.targetDatetime

  if (isAlreadyExtended && isExtending) return

  const isReschedule = params.targetDatetime.getTime() !== current.targetDatetime.getTime()
  await db.timers.update(id, { ...params, updatedAt: new Date() })

  if (isReschedule && current.serverId && current.version !== null) {
    // Reschedule is critical — sync concurrently
    trpc.timers.upsert
      .mutate({
        serverId: current.serverId,
        title: params.title,
        description: current.description,
        emoji: params.emoji,
        targetDatetime: params.targetDatetime.toISOString(),
        originalTargetDatetime: current.originalTargetDatetime.toISOString(),
        status: current.status,
        priority: params.priority,
        isFlagged: current.isFlagged,
        recurrenceRule: current.recurrenceRule,
        version: current.version,
      })
      .then((r) => db.timers.update(id, { syncStatus: 'synced', version: r.version }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    // Title/emoji/priority change — deferred sync
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function bulkImportTimers(timers: Omit<Timer, 'id'>[]): Promise<void> {
  await db.timers.bulkAdd(timers as Timer[])
}
```

- [ ] **Run the full test suite — ensure existing useTimers tests pass**

`createTimer` now requires a `userId` argument. Update the call sites in tests:

In `src/test/useTimers.test.ts`, add `null` as the second argument to all `createTimer(BASE)` calls:

```typescript
const id = await createTimer(BASE, null)
```

- [ ] **Run tests**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/hooks/useTimers.ts src/test/useTimers.test.ts
git commit -m "feat(frontend): tiered sync mutations in useTimers (critical concurrent, deferred pending)"
```

---

### Task 9.3: Wire sync engine in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Add `useSyncEngine` to App.tsx**

Add import:
```tsx
import { useSyncEngine } from './hooks/useSyncEngine'
```

Add after the `useAuth` call inside `App`:
```tsx
useSyncEngine({ user })
```

Update the `handleCreateNew` path to pass `user?.userId ?? null` to `createTimer`. In `CreateEditView`, thread through the `userId` to the `createTimer` call site.

- [ ] **Run full test suite**

```bash
npx vitest run
```

- [ ] **Run dev server and test offline → online flow manually**

```bash
npm run dev
```

1. Open Chrome DevTools → Network → Offline
2. Create a timer — should appear instantly
3. Open Chrome DevTools → Network → Online
4. Timer `syncStatus` should flip to `synced` (check via Dexie DevTools extension)

- [ ] **Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): wire useSyncEngine in App"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| VPC, private subnets, no NAT | 2.1 StorageStack |
| RDS db.t4g.micro + RDS Proxy | 2.1 StorageStack |
| Cognito User Pool + Hosted UI | 2.1 StorageStack |
| Cognito VPC Interface Endpoint | 2.1 StorageStack |
| Auth Lambda (callback/refresh/logout) | 4.1–4.2 |
| API Lambda (tRPC, inside VPC) | 5.1–5.5 |
| JWKS caching fetcher (key rotation safe) | 5.1 context.ts |
| Deploy order runbook | 6.3–6.4 |
| Google + Apple federation | 6.2 EXTERNAL |
| Drizzle schema (users, timers, timer_events) | 3.1 |
| Optimistic concurrency via version | 5.4 timers.upsert/complete/cancel |
| 409 conflict: server wins, CloudWatch log | 9.1 useSyncEngine |
| Dexie v3 migration (serverId, userId, syncStatus, version) | 7.1 |
| lastSyncedAt in localStorage, bounds reconcile | 9.1 useSyncEngine |
| Auth timeout (3s, fallback unauthenticated) | 8.2 useAuth |
| Silent refresh on mount | 8.2 useAuth |
| idToken in-memory only | 8.1 trpc.ts + 8.2 useAuth |
| httpOnly cookie for refresh token | 4.1 routes.ts |
| auth.bootstrap upsert | 5.3 |
| timers.list (non-cancelled) | 5.4 |
| timers.upsert (create + update) | 5.4 |
| timers.complete / timers.cancel | 5.4 |
| timers.reconcile with since param | 5.4 |
| Tiered sync (critical concurrent, deferred pending) | 9.2 |
| Drain pending on mount + online event | 9.1 |
| Pull on reconnect + visibilitychange | 9.1 |
| LoginView (Google + Apple buttons) | 8.3 |
| QueryClientProvider wrapper | 8.4 |
| auth gate (loading spinner / login / app) | 8.4 |
