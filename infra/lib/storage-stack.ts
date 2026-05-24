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

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "Google",
      {
        userPool: this.userPool,
        clientId: this.node.getContext("googleClientId"),
        clientSecretValue: cdk.SecretValue.secretsManager(
          this.node.getContext("googleClientSecretArn"),
        ),
        scopes: ["email", "profile", "openid"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      },
    );

    this.userPoolClient = this.userPool.addClient("AppClient", {
      generateSecret: true,
      authFlows: { userSrp: true },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
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

    this.userPoolClient.node.addDependency(googleProvider);

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "DbInstanceEndpoint", {
      value: this.dbInstanceEndpoint,
    });
  }
}
