const TEST_ENV_DEFAULTS = {
  COGNITO_USER_POOL_ID: "us-east-1_testpool",
  COGNITO_CLIENT_ID: "test-client-id",
  COGNITO_DOMAIN: "https://test.auth.us-east-1.amazoncognito.com",
  DB_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-db",
  DB_ENDPOINT: "test-db.abcdefghij.us-east-1.rds.amazonaws.com",
  COGNITO_CLIENT_SECRET_ARN:
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-cognito",
  AUTH_CALLBACK_URL_PROD: "https://counter-weight.app/auth/callback",
  AUTH_CALLBACK_URL_LOCAL: "https://localhost:5174/auth/callback",
  COGNITO_CLIENT_SECRET: "test-client-secret",
};

export function mockEnv(
  overrides: Partial<typeof TEST_ENV_DEFAULTS> = {},
): void {
  Object.assign(process.env, { ...TEST_ENV_DEFAULTS, ...overrides });
}
