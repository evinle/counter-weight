import Fastify from "fastify";
import awsLambdaFastify from "@fastify/aws-lambda";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createContext } from "./context.js";
import { authRouter } from "./routers/auth.js";
import { timersRouter } from "./routers/timers.js";
import { tagsRouter } from "./routers/tags.js";
import { pushSubscriptionsRouter } from "./routers/pushSubscriptions.js";
import { router } from "./router.js";
import { parseEnv } from "../env.js";
import { ALLOWED_ORIGINS } from "../constants.js";

export const typedEnv = parseEnv(); // validates all env vars at cold start — throws before accepting requests

export const appRouter = router({
  auth: authRouter,
  timers: timersRouter,
  tags: tagsRouter,
  pushSubscriptions: pushSubscriptionsRouter,
});

export type AppRouter = typeof appRouter;

export const app = Fastify({ logger: true });

app.register(compress);
app.register(cors, {
  origin: [...ALLOWED_ORIGINS],
  credentials: true,
});

app.addHook("onSend", (_req, _reply, payload, done) => {
  console.log("[onSend] payload:", payload);
  done(null, payload);
});

app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext, allowMethodOverride: true },
});

const _handler = awsLambdaFastify(app);

export const handler: typeof _handler = async (event, context) => {
  try {
    return await _handler(event, context);
  } catch (err) {
    console.error("[handler] uncaught error after Fastify:", err);
    throw err;
  }
};
