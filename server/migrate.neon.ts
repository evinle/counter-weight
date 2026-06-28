import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { config } from "dotenv";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

config({ path: ".env" });

const arn = process.env.NEON_SECRET_ARN;
if (!arn) throw new Error("NEON_SECRET_ARN env var is required");

const sm = new SecretsManagerClient({});
const result = await sm.send(new GetSecretValueCommand({ SecretId: arn }));

if (!result.SecretString) throw new Error("Neon secret is not a string secret");

const sql = neon(result.SecretString);
const db = drizzle(sql);

const main = async () => {
  try {
    await migrate(db, {
      migrationsFolder: "./db/migrations",
    });
    console.log("Migration completed");
  } catch (error) {
    console.error("Error during migration:", error);
    process.exit(1);
  }
};

main();
