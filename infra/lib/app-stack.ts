import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
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

    // Security group for API Lambda — allows outbound HTTPS to Cognito VPC endpoint
    const apiLambdaSg = new ec2.SecurityGroup(this, 'ApiLambdaSg', {
      vpc: storageStack.vpc,
      allowAllOutbound: false,
    })
    apiLambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS out')
    apiLambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Postgres out')

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
      projectRoot: path.join(__dirname, '../..'),
      environment: {
        COGNITO_DOMAIN: cognitoDomain,
        COGNITO_CLIENT_ID: storageStack.userPoolClient.userPoolClientId,
        AUTH_CALLBACK_URL_PROD: 'https://counter-weight.app/auth/callback',
        AUTH_CALLBACK_URL_LOCAL: 'http://localhost:5174/auth/callback',
        ...(cognitoClientSecretArn && { COGNITO_CLIENT_SECRET_ARN: cognitoClientSecretArn }),
      },
    })

    // API Lambda — inside VPC, reaches RDS via Proxy, reaches Cognito via VPC endpoint
    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      entry: path.join(__dirname, '../../server/api/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(__dirname, '../..'),
      vpc: storageStack.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [apiLambdaSg],
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
