import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { execSync } from 'node:child_process'

const arn = process.env.DB_SECRET_ARN
if (!arn) throw new Error('DB_SECRET_ARN env var is required')

const sm = new SecretsManagerClient({})
const result = await sm.send(new GetSecretValueCommand({ SecretId: arn }))

if (!result.SecretString) throw new Error('DB secret is not a string secret')

const {
  username,
  password,
  host,
  port,
  dbname = 'postgres',
} = JSON.parse(result.SecretString)

const url = `postgresql://${username}:${encodeURIComponent(password)}@${host}:${port}/${dbname}?sslmode=require`

execSync('npx drizzle-kit migrate', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
})
