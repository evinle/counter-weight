import { z } from 'zod'

const envSchema = z.object({
  // Resolved by CDK from CloudFormation outputs — no manual action needed
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_DOMAIN: z.string().url(),
  DB_SECRET_ARN: z.string().startsWith('arn:'),
  DB_PROXY_ENDPOINT: z.string().min(1),

  // Supplied manually via `cdk deploy --context` (see infra/lib/app-stack.ts)
  COGNITO_CLIENT_SECRET_ARN: z.string().startsWith('arn:'),
  AUTH_CALLBACK_URL_PROD: z.string().url(),
  AUTH_CALLBACK_URL_LOCAL: z.string().url(),

  // Local dev / test only — not present in Lambda (uses COGNITO_CLIENT_SECRET_ARN instead)
  COGNITO_CLIENT_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

// Lazy singleton — lets tests set process.env before first use without eager module-load validation
let _env: Env | null = null
export function getTypedEnv(): Env {
  if (!_env) _env = parseEnv()
  return _env
}

export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${String(i.path[0])}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}
