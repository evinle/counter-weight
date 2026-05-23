# Phase 5.1: Remove RDS Proxy [CODEBASE]

> Back to [index](index.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `rds.DatabaseProxy` (not Free Tier eligible, ~$21.60/month) and connect the API Lambda directly to the RDS instance endpoint.

**Architecture:** The API Lambda stays inside the VPC — only the connection target changes. The Lambda security group gets an explicit port 5432 egress rule to the RDS instance. The Lambda still reads credentials from Secrets Manager to build the connection URL; `max: 1` on the postgres client provides sufficient connection management without a proxy for this traffic level.

---

## File Map

| File | Change |
|---|---|
| `infra/lib/storage-stack.ts` | Remove `DatabaseProxy`; expose `dbInstanceEndpoint` and `dbInstanceConnections` |
| `infra/lib/app-stack.ts` | Use `dbInstanceEndpoint`, open port 5432 via security group, remove proxy IAM grant |
| `server/env.ts` | Rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` |
| `server/api/context.ts` | Use `env.DB_ENDPOINT` in connection URL |

---

## Prior Phase Context

Phase 5 is complete. The existing code in `server/api/context.ts` reads `env.DB_PROXY_ENDPOINT` and `env.DB_SECRET_ARN` to build the Postgres connection URL. CDK currently exposes `storageStack.dbProxy.endpoint` and calls `storageStack.dbProxy.grantConnect(apiLambda, 'postgres')`.

---

## Task 5.1.1: Update `infra/lib/storage-stack.ts`

**Files:**
- Modify: `infra/lib/storage-stack.ts`

- [ ] **Replace `dbProxy` public property with `dbInstanceEndpoint` and `dbInstanceConnections`**

In the class property declarations, replace:

```typescript
  public readonly dbProxy: rds.DatabaseProxy;
```

With:

```typescript
  public readonly dbInstanceEndpoint: string;
  public readonly dbInstanceConnections: ec2.Connections;
```

- [ ] **Replace the proxy block with instance endpoint assignments**

Remove the entire `DatabaseProxy` block:

```typescript
    // RDS Proxy — pools connections, prevents Lambda connection exhaustion
    this.dbProxy = new rds.DatabaseProxy(this, "DbProxy", {
      proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
      secrets: [dbInstance.secret!],
      vpc: this.vpc,
      dbProxyName: "counter-weight-proxy",
      requireTLS: true,
    });
```

Replace it with:

```typescript
    this.dbInstanceEndpoint = dbInstance.dbInstanceEndpointAddress;
    this.dbInstanceConnections = dbInstance.connections;
```

- [ ] **Replace the CloudFormation output**

Remove:

```typescript
    new cdk.CfnOutput(this, "DbProxyEndpoint", {
      value: this.dbProxy.endpoint,
    });
```

Add:

```typescript
    new cdk.CfnOutput(this, "DbInstanceEndpoint", {
      value: this.dbInstanceEndpoint,
    });
```

- [ ] **Compile check**

```bash
cd infra && npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Commit**

```bash
git add infra/lib/storage-stack.ts
git commit -m "feat(infra): remove RDS Proxy, expose dbInstanceEndpoint directly"
```

---

## Task 5.1.2: Update `infra/lib/app-stack.ts`

**Files:**
- Modify: `infra/lib/app-stack.ts`

- [ ] **Replace the proxy endpoint env var with the instance endpoint**

Remove:

```typescript
    apiLambda.addEnvironment('DB_PROXY_ENDPOINT', storageStack.dbProxy.endpoint)
```

Add:

```typescript
    apiLambda.addEnvironment('DB_ENDPOINT', storageStack.dbInstanceEndpoint)
```

- [ ] **Remove the proxy IAM grant**

Remove this line:

```typescript
    storageStack.dbProxy.grantConnect(apiLambda, 'postgres')
```

- [ ] **Open port 5432 from the Lambda security group to RDS**

Directly after the `storageStack.dbSecret.grantRead(apiLambda)` line, add:

```typescript
    storageStack.dbInstanceConnections.allowDefaultPortFrom(apiLambdaSg, 'Lambda to RDS')
```

- [ ] **Compile check**

```bash
cd infra && npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Commit**

```bash
git add infra/lib/app-stack.ts
git commit -m "feat(infra): connect API Lambda directly to RDS, remove proxy IAM grant"
```

---

## Task 5.1.3: Update `server/env.ts`

**Files:**
- Modify: `server/env.ts`

- [ ] **Rename `DB_PROXY_ENDPOINT` to `DB_ENDPOINT`**

Replace:

```typescript
  DB_PROXY_ENDPOINT: z.string().min(1),
```

With:

```typescript
  DB_ENDPOINT: z.string().min(1),
```

- [ ] **Commit**

```bash
git add server/env.ts
git commit -m "feat(server): rename DB_PROXY_ENDPOINT to DB_ENDPOINT"
```

---

## Task 5.1.4: Update `server/api/context.ts`

**Files:**
- Modify: `server/api/context.ts`

- [ ] **Use `DB_ENDPOINT` in the connection URL**

Replace:

```typescript
      const url = `postgresql://${username}:${encodeURIComponent(password)}@${env.DB_PROXY_ENDPOINT}:${port}/${dbname}?sslmode=require`;
```

With:

```typescript
      const url = `postgresql://${username}:${encodeURIComponent(password)}@${env.DB_ENDPOINT}:${port}/${dbname}?sslmode=require`;
```

- [ ] **Run the full server test suite**

```bash
cd server && npx vitest run
```

Expected: all tests pass (env schema change affects `mockEnv` — verify `server/test/envHelpers.ts` uses `DB_ENDPOINT` and update it if needed).

- [ ] **Check `server/test/envHelpers.ts` for the old key**

```bash
grep -n "DB_PROXY_ENDPOINT" server/test/envHelpers.ts
```

If any matches: replace `DB_PROXY_ENDPOINT` with `DB_ENDPOINT` in that file and re-run tests.

- [ ] **Commit**

```bash
git add server/api/context.ts server/test/envHelpers.ts
git commit -m "feat(server): use DB_ENDPOINT for direct RDS connection"
```
