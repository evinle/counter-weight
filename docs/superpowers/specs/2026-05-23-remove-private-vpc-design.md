# Remove Private VPC — Public RDS, Lambdas Outside VPC

**Date:** 2026-05-23
**Status:** Approved
**Supersedes:** `2026-05-23-remove-rds-proxy-design.md` (proxy removal is absorbed here)

## Problem

Two AWS services in the current architecture are not Free Tier eligible:

- **RDS Proxy** (~$21.60/month) — pools Lambda connections, but `max: 1` on the postgres client makes this unnecessary for low-traffic personal use
- **VPC Interface Endpoint for Cognito** (~$14.40/month) — required because the API Lambda is in a private VPC with no internet access; needed to reach Cognito JWKS without a NAT gateway

Both exist because the API Lambda was placed inside a private VPC to reach RDS. Removing the private VPC eliminates both costs.

## Approach

Replace the private-only VPC with a minimal public-only VPC. Make RDS publicly accessible. Move both Lambdas outside the VPC entirely. Protect RDS with SSL enforcement, a strong random password, and a limited-privilege application user.

## Architecture

```
Auth Lambda (no VPC) ──internet──▶ Cognito token endpoint
API Lambda  (no VPC) ──internet──▶ Cognito JWKS endpoint
                     ──internet──▶ Secrets Manager (DB credentials)
                     ──internet──▶ RDS db.t4g.micro (public subnet, port 5432)
```

## Changes

### `infra/lib/storage-stack.ts`

**VPC:** Replace private-isolated subnets with public subnets only:

```typescript
new ec2.Vpc(this, 'Vpc', {
  maxAzs: 2,
  natGateways: 0,
  subnetConfiguration: [
    { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
  ],
})
```

**Remove:** VPC Interface Endpoint for Cognito.

**RDS security group:** New explicit security group allowing port 5432 from anywhere:

```typescript
const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
  vpc: this.vpc,
  description: 'RDS public access',
})
dbSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Postgres public access')
```

**RDS instance:** Add `publiclyAccessible: true`, `vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }`, `securityGroups: [dbSg]`.

**RDS parameter group:** Add a custom parameter group with `rds.force_ssl = 1` to enforce SSL at the database level, rejecting any unencrypted connections server-side.

**Remove:** `DatabaseProxy` resource and `public readonly dbProxy` property.

**Add:** `public readonly dbInstanceEndpoint: string` (value: `dbInstance.dbInstanceEndpointAddress`).

**Remove:** `public readonly vpc` — AppStack no longer needs it.

**CloudFormation outputs:** Remove `DbProxyEndpoint`, add `DbInstanceEndpoint`.

### `infra/lib/app-stack.ts`

**API Lambda:** Remove `vpc`, `vpcSubnets`, `securityGroups`. Remove `apiLambdaSg` security group and its egress rules entirely.

**Env vars:** Replace `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` (sourced from `storageStack.dbInstanceEndpoint`).

**Remove:** `storageStack.dbProxy.grantConnect(apiLambda, 'postgres')`.

**Keep:** `storageStack.dbSecret.grantRead(apiLambda)` and `DB_SECRET_ARN` env var — Lambda still reads credentials from Secrets Manager at init time.

**Auth Lambda:** No changes — was already outside the VPC.

**API Gateway throttling:** Add stage-level rate and burst limits to reject excess requests before Lambda is invoked:

```typescript
const api = new apigateway.HttpApi(this, 'Api', {
  ...
  defaultRouteSettings: {
    throttlingBurstLimit: 100,
    throttlingRateLimit: 50,
  },
})
```

**JWT authorizer on `/trpc/*`:** Add a Cognito JWT authorizer so unauthenticated requests are rejected at the gateway without invoking Lambda:

```typescript
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'

const jwtAuthorizer = new HttpJwtAuthorizer('CognitoAuthorizer', cognitoDomain + '/.well-known/jwks.json', {
  jwtAudience: [storageStack.userPoolClient.userPoolClientId],
})
```

Apply `authorizer: jwtAuthorizer` to the `/trpc/{proxy+}` route only. Auth routes (`/auth/{proxy+}`) stay without an authorizer — they are the login endpoints.

**Lambda reserved concurrency:** Cap concurrent executions on both Lambdas to limit blast radius under a flood:

```typescript
// On both authLambda and apiLambda:
reservedConcurrentExecutions: 10
```

10 concurrent executions is well above what a personal app needs and prevents runaway scaling under attack.

### `server/env.ts`

Rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` in the Zod schema.

### `server/api/context.ts`

Update connection URL: `env.DB_PROXY_ENDPOINT` → `env.DB_ENDPOINT`.

## Security Posture

| Layer | Measure |
|---|---|
| Network | Security group allows port 5432 from `0.0.0.0/0`; no other ports exposed |
| Transport | `sslmode=require` in connection string + `rds.force_ssl = 1` in parameter group |
| Authentication | 32-char random password in Secrets Manager |
| Authorization | Dedicated limited-privilege app DB user (post-deploy manual step — see below) |
| API rate limiting | API Gateway stage throttling: 50 RPS steady, 100 burst — 429 before Lambda invoked |
| Auth enforcement | JWT authorizer on `/trpc/*` — unauthenticated requests rejected at gateway |
| Concurrency cap | Lambda reserved concurrency: 10 per function — limits scaling under flood |
| DDoS | AWS Shield Standard (always active, free) covers network/transport layer floods |

## Post-Deploy Manual Step

After the first deploy, create a limited-privilege application user in Postgres. Connect as the `postgres` superuser (credentials from Secrets Manager), then:

```sql
CREATE USER app_user WITH PASSWORD '<strong-random-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

Update the `DATABASE_URL` the Lambda uses to connect as `app_user` instead of `postgres`. Store the `app_user` password in Secrets Manager (or update the existing secret).

## What Does Not Change

- Both Lambda handlers (`server/auth/`, `server/api/`) — no code changes
- tRPC router, Drizzle schema, all business logic
- Cognito User Pool and App Client
- Secrets Manager secrets (DB secret + Cognito client secret)
- API Gateway routes
- `server/db/index.ts` — `createDb()` with `max: 1` remains correct
