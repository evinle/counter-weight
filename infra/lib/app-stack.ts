import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";
import type { StorageStack } from "./storage-stack";
import { ALLOWED_ORIGINS, PROD_CALLBACK_URL, LOCAL_CALLBACK_URL } from "./constants";

interface AppStackProps extends cdk.StackProps {
  storageStack: StorageStack;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { storageStack } = props;
    const region = this.region;

    const cognitoDomain = `https://${storageStack.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`;

    // cognitoClientSecretArn is not available until after StorageStack is deployed and
    // the secret is created manually (Task 6.2). Use tryGetContext so bootstrap and
    // StorageStack-only deploys don't fail. AppStack deploy requires it explicitly:
    //   cdk deploy AppStack --context cognitoClientSecretArn=<ARN>
    const cognitoClientSecretArn = this.node.tryGetContext(
      "cognitoClientSecretArn",
    ) as string | undefined;

    // Auth Lambda — outside VPC, internet access for Cognito token endpoint
    const authLambda = new NodejsFunction(this, "AuthLambda", {
      entry: path.join(__dirname, "../../server/auth/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(__dirname, "../.."),
      environment: {
        COGNITO_DOMAIN: cognitoDomain,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
        AUTH_CALLBACK_URL_PROD: PROD_CALLBACK_URL,
        AUTH_CALLBACK_URL_LOCAL: LOCAL_CALLBACK_URL,
        ...(cognitoClientSecretArn && {
          COGNITO_CLIENT_SECRET_ARN: cognitoClientSecretArn,
        }),
      },
    });

    // API Lambda — outside VPC, connects to RDS and Cognito over internet
    const apiLambda = new NodejsFunction(this, "ApiLambda", {
      entry: path.join(__dirname, "../../server/api/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(__dirname, "../.."),
      environment: {
        COGNITO_USER_POOL_ID: storageStack.userPool.userPoolId,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
      },
    });

    // Grant Auth Lambda SM read for Cognito client secret (only when ARN is provided)
    if (cognitoClientSecretArn) {
      const cognitoClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        "CognitoClientSecret",
        cognitoClientSecretArn,
      );
      cognitoClientSecret.grantRead(authLambda);
    }

    // Grant API Lambda access to read the DB secret (for DATABASE_URL)
    storageStack.dbSecret.grantRead(apiLambda);

    // Inject DB endpoint (Lambda reads credentials from Secrets Manager at init)
    apiLambda.addEnvironment("DB_ENDPOINT", storageStack.dbInstanceEndpoint);
    apiLambda.addEnvironment("DB_SECRET_ARN", storageStack.dbSecret.secretArn);

    // JWT authorizer — validates Cognito id tokens on /trpc/* routes at gateway level
    const jwtAuthorizer = new HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${region}.amazonaws.com/${storageStack.userPool.userPoolId}`,
      {
        jwtAudience: [storageStack.userPoolClient.userPoolClientId],
      },
    );

    // API Gateway HTTP API with stage-level throttling (50 RPS / 100 burst)
    const api = new apigateway.HttpApi(this, "Api", {
      apiName: "counter-weight-api",
      corsPreflight: {
        allowOrigins: [...ALLOWED_ORIGINS],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ["content-type", "authorization"],
        allowCredentials: true,
      },
    });

    // Apply throttling to the default stage via the L1 escape hatch
    const defaultStage = api.defaultStage?.node.defaultChild as
      | apigateway.CfnStage
      | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      };
    }

    // Auth routes — no authorizer (these are the login/callback endpoints)
    api.addRoutes({
      path: "/auth/{proxy+}",
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("AuthIntegration", authLambda),
    });

    // tRPC routes — JWT authorizer rejects unauthenticated requests before Lambda is invoked
    api.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigateway.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiLambda),
      authorizer: jwtAuthorizer,
    });

    // Explicit OPTIONS route without authorizer — JWT authorizer runs before API Gateway's
    // automatic CORS handling, causing preflight requests to get 401. Routing OPTIONS
    // separately bypasses the authorizer so Fastify's CORS middleware can return 200.
    api.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigateway.HttpMethod.OPTIONS],
      integration: new HttpLambdaIntegration("ApiOptionsIntegration", apiLambda),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });

    const apiCert = new acm.Certificate(this, "ApiCert", {
      domainName: "api.evinle.app",
      validation: acm.CertificateValidation.fromDns(),
    });

    const customDomain = new apigateway.DomainName(this, "ApiCustomDomain", {
      domainName: "api.evinle.app",
      certificate: apiCert,
    });

    new apigateway.ApiMapping(this, "ApiMapping", {
      api,
      domainName: customDomain,
    });

    new cdk.CfnOutput(this, "ApiRegionalDomainName", {
      value: customDomain.regionalDomainName,
    });
  }
}
