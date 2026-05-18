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
