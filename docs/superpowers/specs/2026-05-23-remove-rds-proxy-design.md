# Remove RDS Proxy Design

**Date:** 2026-05-23
**Status:** Approved

## Problem

`rds.DatabaseProxy` is not AWS Free Tier eligible (~$21.60/month). It was added to prevent Lambda connection exhaustion, but for a low-traffic personal app with `max: 1` on the postgres client, direct RDS connection is sufficient.

## Scope

Remove the RDS Proxy resource and connect the API Lambda directly to the RDS instance endpoint. No other infrastructure changes — VPC, VPC Interface Endpoint, RDS instance, and Cognito all stay.

## Architecture

The Lambda stays inside the VPC (still needs to reach the RDS instance in the private subnet). The only change is the connection target and one IAM grant.

```
API Lambda (inside VPC)
  → RDS db.t4g.micro (private subnet, direct connection via security group)
  → Cognito JWKS (via VPC Interface Endpoint, unchanged)
```

## Changes

### `infra/lib/storage-stack.ts`

- Remove `rds.DatabaseProxy` resource
- Remove `public readonly dbProxy: rds.DatabaseProxy`
- Add `public readonly dbInstanceEndpoint: string` — value: `dbInstance.dbInstanceEndpointAddress`
- Add `public readonly dbInstanceConnections: ec2.Connections` — value: `dbInstance.connections`, needed so `AppStack` can open port 5432 from the Lambda security group
- Remove `DbProxyEndpoint` CloudFormation output; add `DbInstanceEndpoint`

### `infra/lib/app-stack.ts`

- Replace `storageStack.dbProxy.endpoint` → `storageStack.dbInstanceEndpoint` in the Lambda env var
- Rename Lambda env var `DB_PROXY_ENDPOINT` → `DB_ENDPOINT`
- Remove `storageStack.dbProxy.grantConnect(apiLambda, 'postgres')` — proxy IAM auth no longer applicable
- Add `storageStack.dbInstanceConnections.allowDefaultPortFrom(apiLambdaSg)` — opens port 5432 from the Lambda security group directly to the RDS instance

### `server/env.ts`

- Rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` in the Zod schema

### `server/api/context.ts`

- Update connection URL construction: `env.DB_PROXY_ENDPOINT` → `env.DB_ENDPOINT`

## What does not change

- VPC and private subnets — Lambda still needs to be in the VPC to reach RDS
- VPC Interface Endpoint for Cognito — still needed since Lambda is in the VPC with no NAT
- RDS instance (`db.t4g.micro`) — free tier eligible, stays as-is
- Secrets Manager DB secret — Lambda still reads username/password from it to build `DATABASE_URL`
- Auth Lambda — outside VPC, unaffected

## Connection pooling

The existing `createDb()` already sets `max: 1` on the postgres client (one connection per Lambda instance). This is the standard Lambda pattern and sufficient for low-traffic personal use without a proxy.
