# Phase 5.1: Remove Private VPC [CODEBASE]

> Back to [index](index.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all non-free-tier AWS costs by replacing the private VPC with a minimal public VPC, making RDS publicly accessible (SSL-enforced, security-group-gated), removing the DatabaseProxy and VPC Interface Endpoint, moving the API Lambda outside the VPC, and hardening the API Gateway with throttling, a Cognito JWT authorizer, and Lambda reserved concurrency.

**Architecture:** The API Lambda and Auth Lambda both run outside any VPC and connect to Cognito and RDS over the public internet. RDS is protected by SSL enforcement at the parameter group level, a strong random password in Secrets Manager, and a security group that allows only port 5432. API Gateway rejects unauthenticated `/trpc/*` requests before Lambda is invoked via a Cognito JWT authorizer, and stage throttling caps steady-state throughput at 50 RPS.

**Tech Stack:** CDK v2, `aws-cdk-lib/aws-apigatewayv2-authorizers`, Zod, Vitest

---

## File Map

| File | Change |
|---|---|
| `infra/lib/storage-stack.ts` | Replace private VPC with public VPC; remove VPC Interface Endpoint; add RDS parameter group (SSL); add RDS security group (port 5432 public); remove `DatabaseProxy`; remove `dbProxy` and `vpc` properties; add `dbInstanceEndpoint` |
| `infra/lib/app-stack.ts` | Remove `apiLambdaSg` and all VPC config from API Lambda; rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT`; remove `dbProxy.grantConnect`; add `HttpJwtAuthorizer` on `/trpc/*`; add stage throttling; add `reservedConcurrentExecutions: 10` to both Lambdas |
| `server/env.ts` | Rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` in Zod schema |
| `server/api/context.ts` | Use `env.DB_ENDPOINT` in connection URL |
| `server/test/envHelpers.ts` | Rename `DB_PROXY_ENDPOINT` → `DB_ENDPOINT` in mock defaults |

---

## Prior Phase Context

Phase 5 is complete. The existing infra uses a private-isolated VPC, a Cognito VPC Interface Endpoint (~$14.40/month), and an RDS Proxy (~$21.60/month). The API Lambda is inside the VPC. `server/api/context.ts` reads `env.DB_PROXY_ENDPOINT` and `env.DB_SECRET_ARN` to build the Postgres connection URL.

---

## Task 5.1.1: Update `infra/lib/storage-stack.ts`

**Files:**
- Modify: `infra/lib/storage-stack.ts`

- [ ] **Replace the entire file content**

The changes are spread throughout the file, so replace it in full:

```typescript
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class StorageStack extends cdk.Stack {
  public readonly dbInstanceEndpoint: string;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoDomainPrefix: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Minimal public VPC — no NAT, no private subnets, no VPC endpoints
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    // Security group: allow port 5432 from anywhere; SSL enforced at parameter group level
    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "RDS public access",
    });
    dbSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      "Postgres public access",
    );

    // Parameter group: enforce SSL at the database level, rejecting unencrypted connections
    const dbParamGroup = new rds.ParameterGroup(this, "DbParamGroup", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      parameters: { "rds.force_ssl": "1" },
    });

    const dbInstance = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [dbSg],
      parameterGroup: dbParamGroup,
      publiclyAccessible: true,
      multiAz: false,
      storageEncrypted: true,
      deletionProtection: this.node.tryGetContext("env") === "prod",
    });

    this.dbSecret = dbInstance.secret!;
    this.dbInstanceEndpoint = dbInstance.dbInstanceEndpointAddress;

    // Cognito User Pool
    this.cognitoDomainPrefix = "counter-weight-auth";

    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: this.cognitoDomainPrefix },
    });

    this.userPoolClient = this.userPool.addClient("AppClient", {
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
          "http://localhost:5174/auth/callback",
          "https://counter-weight.app/auth/callback",
        ],
        logoutUrls: ["http://localhost:5174", "https://counter-weight.app"],
      },
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "DbInstanceEndpoint", {
      value: this.dbInstanceEndpoint,
    });
  }
}
```

- [ ] **Compile check**

```bash
cd infra && npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Commit**

```bash
git add infra/lib/storage-stack.ts
git commit -m "feat(infra): replace private VPC with public, remove DatabaseProxy and VPC endpoint"
```

---

## Task 5.1.2: Update `infra/lib/app-stack.ts`

**Files:**
- Modify: `infra/lib/app-stack.ts`

- [ ] **Replace the entire file content**

The changes touch the import list, the security group block, both Lambda definitions, the IAM grants, and the API Gateway setup:

```typescript
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
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

    // cognitoClientSecretArn is not available until after StorageStack is deployed and
    // the secret is created manually (Task 6.2). Use tryGetContext so bootstrap and
    // StorageStack-only deploys don't fail. AppStack deploy requires it explicitly:
    //   cdk deploy AppStack --context cognitoClientSecretArn=<ARN>
    const cognitoClientSecretArn = this.node.tryGetContext('cognitoClientSecretArn') as string | undefined

    // Auth Lambda — outside VPC, internet access for Cognito token endpoint
    const authLambda = new NodejsFunction(this, 'AuthLambda', {
      entry: path.join(__dirname, '../../server/auth/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      reservedConcurrentExecutions: 10,
      projectRoot: path.join(__dirname, '../..'),
      environment: {
        COGNITO_DOMAIN: cognitoDomain,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
        AUTH_CALLBACK_URL_PROD: 'https://counter-weight.app/auth/callback',
        AUTH_CALLBACK_URL_LOCAL: 'http://localhost:5174/auth/callback',
        ...(cognitoClientSecretArn && { COGNITO_CLIENT_SECRET_ARN: cognitoClientSecretArn }),
      },
    })

    // API Lambda — outside VPC, connects to RDS and Cognito over internet
    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      entry: path.join(__dirname, '../../server/api/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      reservedConcurrentExecutions: 10,
      projectRoot: path.join(__dirname, '../..'),
      environment: {
        COGNITO_USER_POOL_ID: storageStack.userPool.userPoolId,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
      },
    })

    // Grant Auth Lambda SM read for Cognito client secret (only when ARN is provided)
    if (cognitoClientSecretArn) {
      const cognitoClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
        this, 'CognitoClientSecret',
        cognitoClientSecretArn,
      )
      cognitoClientSecret.grantRead(authLambda)
    }

    // Grant API Lambda access to read the DB secret (for DATABASE_URL)
    storageStack.dbSecret.grantRead(apiLambda)

    // Inject DB endpoint (Lambda reads credentials from Secrets Manager at init)
    apiLambda.addEnvironment('DB_ENDPOINT', storageStack.dbInstanceEndpoint)
    apiLambda.addEnvironment('DB_SECRET_ARN', storageStack.dbSecret.secretArn)

    // JWT authorizer — validates Cognito id tokens on /trpc/* routes at gateway level
    const jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      cognitoDomain + '/.well-known/jwks.json',
      {
        jwtAudience: [storageStack.userPoolClient.userPoolClientId],
      },
    )

    // API Gateway HTTP API with stage-level throttling (50 RPS / 100 burst)
    const api = new apigateway.HttpApi(this, 'Api', {
      apiName: 'counter-weight-api',
      corsPreflight: {
        allowOrigins: ['http://localhost:5174', 'https://counter-weight.app'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['content-type', 'authorization'],
        allowCredentials: true,
      },
      defaultRouteSettings: {
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
    })

    // Auth routes — no authorizer (these are the login/callback endpoints)
    api.addRoutes({
      path: '/auth/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('AuthIntegration', authLambda),
    })

    // tRPC routes — JWT authorizer rejects unauthenticated requests before Lambda is invoked
    api.addRoutes({
      path: '/trpc/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', apiLambda),
      authorizer: jwtAuthorizer,
    })

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint })
  }
}
```

- [ ] **Compile check**

```bash
cd infra && npx tsc --noEmit
```

Expected: no output (no errors). If you see `Cannot find module 'aws-cdk-lib/aws-apigatewayv2-authorizers'`, run `cd infra && npm install` first.

- [ ] **Commit**

```bash
git add infra/lib/app-stack.ts
git commit -m "feat(infra): move API Lambda outside VPC, add JWT authorizer and throttling"
```

---

## Task 5.1.3: Update `server/env.ts` and `server/test/envHelpers.ts`

**Files:**
- Modify: `server/env.ts`
- Modify: `server/test/envHelpers.ts`

- [ ] **Rename `DB_PROXY_ENDPOINT` to `DB_ENDPOINT` in `server/env.ts`**

Replace:

```typescript
  DB_PROXY_ENDPOINT: z.string().min(1),
```

With:

```typescript
  DB_ENDPOINT: z.string().min(1),
```

- [ ] **Rename `DB_PROXY_ENDPOINT` to `DB_ENDPOINT` in `server/test/envHelpers.ts`**

Replace:

```typescript
  DB_PROXY_ENDPOINT: 'test-proxy.proxy-xyz.us-east-1.rds.amazonaws.com',
```

With:

```typescript
  DB_ENDPOINT: 'test-db.abcdefghij.us-east-1.rds.amazonaws.com',
```

- [ ] **Commit**

```bash
git add server/env.ts server/test/envHelpers.ts
git commit -m "feat(server): rename DB_PROXY_ENDPOINT to DB_ENDPOINT"
```

---

## Task 5.1.4: Update `server/api/context.ts` and verify tests

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

Expected: all tests pass.

- [ ] **Confirm no remaining `DB_PROXY_ENDPOINT` references**

```bash
grep -rn "DB_PROXY_ENDPOINT" server/
```

Expected: no output.

- [ ] **Commit**

```bash
git add server/api/context.ts
git commit -m "feat(server): use DB_ENDPOINT for direct RDS connection"
```

---

## Task 5.1.5: Update index.md

**Files:**
- Modify: `docs/superpowers/plans/milestone-2/index.md`

- [ ] **Update the architecture description**

Replace the current architecture paragraph (which describes VPC, NAT, and RDS Proxy) with:

```
**Architecture:** Auth Lambda (outside VPC) handles token exchange via Cognito's Hosted UI; API Lambda (outside VPC) exposes a tRPC/Fastify router backed by Drizzle + RDS (publicly accessible, SSL-enforced, direct connection). Frontend stays fully functional offline; sync happens in a tiered background engine. JWT verification uses `aws-jwt-verify`'s caching JWKS fetcher. API Gateway enforces Cognito JWT on `/trpc/*` routes and rate-limits at 50 RPS.
```

- [ ] **Update the Phase 5.1 row in the Phase Table**

Replace the existing Phase 5.1 row:

```
| [Phase 5.1: Remove RDS Proxy](phase-5.1-remove-rds-proxy.md) | CODEBASE | Remove DatabaseProxy, connect Lambda directly to RDS | Phase 5 |
```

With:

```
| [Phase 5.1: Remove Private VPC](phase-5.1-remove-private-vpc.md) | CODEBASE | Public VPC, public RDS (SSL-enforced), Lambdas outside VPC, JWT authorizer + throttling | Phase 5 |
```

- [ ] **Update Phase 6 dependency**

Ensure Phase 6 row lists `Phase 0, 2, 5.1` as its dependency (it should already say this from the previous phase-5.1 addition).

- [ ] **Update the Spec Coverage table**

Replace:

```
| RDS db.t4g.micro (direct connection) | 2.1 StorageStack + 5.1 |
| Cognito VPC Interface Endpoint | 2.1 StorageStack |
```

With:

```
| RDS db.t4g.micro (public, SSL-enforced, direct connection) | 2.1 StorageStack + 5.1 |
| API Gateway JWT authorizer on /trpc/* | 5.1 AppStack |
| API Gateway throttling (50 RPS / 100 burst) | 5.1 AppStack |
| Lambda reserved concurrency (10 per function) | 5.1 AppStack |
```

- [ ] **Commit**

```bash
git add docs/superpowers/plans/milestone-2/index.md
git commit -m "docs: update milestone-2 index to reflect phase 5.1 VPC rework scope"
```
