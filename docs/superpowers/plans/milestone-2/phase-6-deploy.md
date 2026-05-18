# Phase 6: First Deploy [EXTERNAL + CODEBASE commands]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 2 (CDK stacks):**
- `infra/lib/storage-stack.ts` — StorageStack CDK definition
- `infra/lib/app-stack.ts` — AppStack CDK definition
- Deploy scripts in `infra/package.json`: `npm run deploy:storage`, `npm run deploy:app`
- `cognitoDomainPrefix` in StorageStack is `'counter-weight-auth'` — globally unique, change if already taken

**From Phase 4 + 5 (Lambda handlers):**
- `server/auth/index.ts` — Auth Lambda handler (bundled by AppStack at deploy)
- `server/api/index.ts` — API Lambda handler (bundled by AppStack at deploy)
- Migration: `cd server && npm run migrate` — requires `DATABASE_URL` env var pointing to RDS via proxy

**From Phase 0 (prerequisites):** AWS CLI configured, CDK bootstrapped, Google OAuth client ID and secret noted.

**Deploy order is strict: StorageStack → federation config → migrations → AppStack.**

> **Runbook note:** `counter-weight-auth` is a globally unique Cognito domain prefix. If another account has already claimed it, `cdk deploy StorageStack` will fail with an opaque `ResourceInUse` or `InvalidParameterException` error. If this happens, change `cognitoDomainPrefix` in `storage-stack.ts` to a unique value (e.g. `counter-weight-auth-<your-aws-account-id>`) before redeploying.

---

## Task 6.1: Deploy StorageStack

- [ ] **Deploy StorageStack** (takes ~15 min for RDS)

```bash
cd infra && npm run deploy:storage
```

Expected output: `StorageStack` successfully deployed. Note the outputs:
- `UserPoolId`
- `UserPoolClientId`
- `DbProxyEndpoint`

---

## Task 6.2: Configure Cognito federation providers [EXTERNAL]

> **Sequencing note:** `selfSignUpEnabled: false` is set in StorageStack, which means the User Pool has no usable identity providers until this task is complete. No end-to-end auth testing is possible until Task 6.2 is done and AppStack is redeployed (Task 6.4). Complete this task before attempting any login flow.

- [ ] In AWS Console → Cognito → User Pools → your pool → Sign-in experience → Federated identity providers
- [ ] Add Google: paste Client ID and Client Secret from Task 0.2
- [ ] (Optional) Add Apple: paste Team ID, Services ID, Key ID, and `.p8` private key from Task 0.3
- [ ] In the App client settings, enable Google (and Apple) as identity providers

---

## Task 6.3: Store Cognito client secret + run migrations [EXTERNAL]

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

---

## Task 6.4: Deploy AppStack

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
