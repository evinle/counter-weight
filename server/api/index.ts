import Fastify from 'fastify'
import awsLambdaFastify from '@fastify/aws-lambda'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { createContext } from './context.js'
import { authRouter } from './routers/auth.js'
import { timersRouter } from './routers/timers.js'
import { router } from './router.js'
import { parseEnv } from '../env.js'

parseEnv() // validates all env vars at cold start — throws before accepting requests

export const appRouter = router({
  auth: authRouter,
  timers: timersRouter,
})

export type AppRouter = typeof appRouter

const app = Fastify({ logger: true })

app.register(cors, {
  origin: ['http://localhost:5174', 'https://counter-weight.app'],
  credentials: true,
})

app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
})

export const handler = awsLambdaFastify(app)
