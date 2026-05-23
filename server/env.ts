import { z } from 'zod'

const authEnvSchema = z.object({
  COGNITO_DOMAIN: z.string().url(),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_CLIENT_SECRET_ARN: z.string().startsWith('arn:'),
  AUTH_CALLBACK_URL_PROD: z.string().url(),
  AUTH_CALLBACK_URL_LOCAL: z.string().url(),
  COGNITO_CLIENT_SECRET: z.string().optional(),
})

const apiEnvSchema = z.object({
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  DB_SECRET_ARN: z.string().startsWith('arn:'),
  DB_ENDPOINT: z.string().min(1),
})

export type AuthEnv = z.infer<typeof authEnvSchema>
export type ApiEnv = z.infer<typeof apiEnvSchema>

function parseSchema<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${String(i.path[0])}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

let _authEnv: AuthEnv | null = null
export function getAuthEnv(): AuthEnv {
  if (!_authEnv) _authEnv = parseSchema(authEnvSchema)
  return _authEnv
}

let _apiEnv: ApiEnv | null = null
export function getApiEnv(): ApiEnv {
  if (!_apiEnv) _apiEnv = parseSchema(apiEnvSchema)
  return _apiEnv
}

// Called at API Lambda cold start to fail fast before accepting requests
export function parseEnv(): ApiEnv {
  return parseSchema(apiEnvSchema)
}
