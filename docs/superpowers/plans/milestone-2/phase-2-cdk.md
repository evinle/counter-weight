# Phase 2: CDK Infrastructure [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

From Phase 1, the following server entry points are referenced by AppStack at deploy time:

- `server/auth/index.ts` — Auth Lambda handler (created in Phase 4)
- `server/api/index.ts` — API Lambda handler (created in Phase 5)

AppStack uses `NodejsFunction` to bundle these at deploy time; the files don't need to exist to run `cdk synth`. TypeScript compilation of the CDK code itself only needs the type import (`import type { StorageStack }`), not the actual server source.

**infra/ package** was initialised in Task 1.1:

- `infra/package.json` — aws-cdk-lib@^2.180.0, constructs@^10.0.0
- `infra/tsconfig.json` — target ES2022, module commonjs, include: [bin, lib]
- `infra/cdk.json` — app: `npx ts-node --prefer-ts-exts bin/app.ts`

---

## Task 2.1: StorageStack

**Files:**

- Create: `infra/lib/storage-stack.ts`

- [ ] **Create `infra/lib/storage-stack.ts`**

```typescript
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class StorageStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly dbProxy: rds.DatabaseProxy;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoDomainPrefix: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC: private subnets only, no NAT
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Cognito VPC Interface Endpoint — allows API Lambda to re-fetch JWKS
    // on key rotation without needing a NAT gateway. Private DNS resolves
    // cognito-idp.<region>.amazonaws.com to the private endpoint automatically.
    this.vpc.addInterfaceEndpoint("CognitoEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      privateDnsEnabled: true,
    });

    // RDS PostgreSQL
    const dbInstance = new rds.DatabaseInstance(this, "Db", {
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
      deletionProtection: this.node.tryGetContext("env") === "prod",
    });

    this.dbSecret = dbInstance.secret!;

    // RDS Proxy — pools connections, prevents Lambda connection exhaustion
    this.dbProxy = new rds.DatabaseProxy(this, "DbProxy", {
      proxyTargets: [rds.ProxyTarget.fromInstance(dbInstance)],
      secrets: [dbInstance.secret!],
      vpc: this.vpc,
      dbProxyName: "counter-weight-proxy",
      requireTLS: true,
    });

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
          "https://localhost:5174/auth/callback",
          "https://counter-weight.app/auth/callback",
        ],
        logoutUrls: ["https://localhost:5174", "https://counter-weight.app"],
      },
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "DbProxyEndpoint", {
      value: this.dbProxy.endpoint,
    });
  }
}
```

- [ ] **Commit**

```bash
git add infra/lib/storage-stack.ts
git commit -m "feat(infra): add StorageStack (VPC, RDS, RDS Proxy, Cognito, VPC endpoint)"
```

---

## Task 2.2: AppStack

**Files:**

- Create: `infra/lib/app-stack.ts`

- [ ] **Create `infra/lib/app-stack.ts`**

```typescript
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";
import type { StorageStack } from "./storage-stack";

interface AppStackProps extends cdk.StackProps {
  storageStack: StorageStack;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { storageStack } = props;
    const region = this.region;

    const cognitoDomain = `https://${storageStack.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`;

    // Security group for API Lambda — allows outbound HTTPS to Cognito VPC endpoint
    const apiLambdaSg = new ec2.SecurityGroup(this, "ApiLambdaSg", {
      vpc: storageStack.vpc,
      allowAllOutbound: false,
    });
    apiLambdaSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "HTTPS out",
    );
    apiLambdaSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      "Postgres out",
    );

    // Auth Lambda — outside VPC, internet access for Cognito token endpoint
    const authLambda = new NodejsFunction(this, "AuthLambda", {
      entry: path.join(__dirname, "../../server/auth/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_DOMAIN: cognitoDomain,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
        AUTH_CALLBACK_URL_PROD: "https://counter-weight.app/auth/callback",
        AUTH_CALLBACK_URL_LOCAL: "https://localhost:5174/auth/callback",
        // COGNITO_CLIENT_SECRET_ARN is the ARN of a Secrets Manager secret you create
        // manually after deploying StorageStack (see Task 6.2 manual steps).
        // Pass it as a CDK context value: cdk deploy --context cognitoClientSecretArn=<ARN>
        COGNITO_CLIENT_SECRET_ARN: this.node.getContext(
          "cognitoClientSecretArn",
        ) as string,
      },
    });

    // API Lambda — inside VPC, reaches RDS via Proxy, reaches Cognito via VPC endpoint
    const apiLambda = new NodejsFunction(this, "ApiLambda", {
      entry: path.join(__dirname, "../../server/api/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      vpc: storageStack.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [apiLambdaSg],
      environment: {
        COGNITO_USER_POOL_ID: storageStack.userPool.userPoolId,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
      },
    });

    // Grant Auth Lambda SM read for Cognito client secret
    const cognitoClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "CognitoClientSecret",
      this.node.getContext("cognitoClientSecretArn") as string,
    );
    cognitoClientSecret.grantRead(authLambda);

    // Grant API Lambda access to read the DB secret (for DATABASE_URL)
    storageStack.dbSecret.grantRead(apiLambda);
    storageStack.dbProxy.grantConnect(apiLambda, "postgres");

    // Inject DATABASE_URL from proxy endpoint (read secret at Lambda init)
    apiLambda.addEnvironment(
      "DB_PROXY_ENDPOINT",
      storageStack.dbProxy.endpoint,
    );
    apiLambda.addEnvironment("DB_SECRET_ARN", storageStack.dbSecret.secretArn);

    // API Gateway HTTP API
    const api = new apigateway.HttpApi(this, "Api", {
      apiName: "counter-weight-api",
      corsPreflight: {
        allowOrigins: ["https://localhost:5174", "https://counter-weight.app"],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ["content-type", "authorization"],
        allowCredentials: true,
      },
    });

    api.addRoutes({
      path: "/auth/{proxy+}",
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("AuthIntegration", authLambda),
    });

    api.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiLambda),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
  }
}
```

- [ ] **Commit**

```bash
git add infra/lib/app-stack.ts
git commit -m "feat(infra): add AppStack (Auth Lambda, API Lambda, API Gateway)"
```

---

## Task 2.3: CDK entry point

**Files:**

- Create: `infra/bin/app.ts`

- [ ] **Create `infra/bin/app.ts`**

```typescript
import * as cdk from "aws-cdk-lib";
import { StorageStack } from "../lib/storage-stack";
import { AppStack } from "../lib/app-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const storageStack = new StorageStack(app, "StorageStack", { env });
new AppStack(app, "AppStack", { storageStack, env });
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
