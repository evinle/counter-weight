import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { ALLOWED_ORIGINS, PROD_CALLBACK_URL, LOCAL_CALLBACK_URL } from "./constants";

export class StorageStack extends cdk.Stack {
  public readonly neonSecret: secretsmanager.ISecret;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoDomainPrefix: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // neonSecretArn must be provided at deploy time:
    //   cdk deploy StorageStack --context neonSecretArn=<ARN>
    const neonSecretArn = this.node.tryGetContext("neonSecretArn") as
      | string
      | undefined;

    if (!neonSecretArn) {
      throw new Error(
        "neonSecretArn context value is required. Pass --context neonSecretArn=<ARN>",
      );
    }

    this.neonSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "NeonSecret",
      neonSecretArn,
    );

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
        callbackUrls: [LOCAL_CALLBACK_URL, PROD_CALLBACK_URL],
        logoutUrls: [...ALLOWED_ORIGINS],
      },
    });

    const googleClientId = this.node.tryGetContext("googleClientId") as
      | string
      | undefined;
    const googleClientSecretArn = this.node.tryGetContext(
      "googleClientSecretArn",
    ) as string | undefined;

    if (googleClientId && googleClientSecretArn) {
      const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
        this,
        "Google",
        {
          userPool: this.userPool,
          clientId: googleClientId,
          clientSecretValue: cdk.SecretValue.secretsManager(
            googleClientSecretArn,
          ),
          scopes: ["email", "profile", "openid"],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
            familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          },
        },
      );

      this.userPoolClient.node.addDependency(googleProvider);
    }

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
