import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { execSync } from "node:child_process";

const arn = process.env.NEON_SECRET_ARN;
if (!arn) throw new Error("NEON_SECRET_ARN env var is required");

const sm = new SecretsManagerClient({});
const result = await sm.send(new GetSecretValueCommand({ SecretId: arn }));

if (!result.SecretString) throw new Error("Neon secret is not a string secret");

execSync("npx drizzle-kit migrate", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: result.SecretString },
});
