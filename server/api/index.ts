import Fastify from "fastify";
import awsLambdaFastify from "@fastify/aws-lambda";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createContext } from "./context.js";
import { authRouter } from "./routers/auth.js";
import { timersRouter } from "./routers/timers.js";
import { router } from "./router.js";
import { parseEnv } from "../env.js";

export const typedEnv = parseEnv(); // validates all env vars at cold start — throws before accepting requests

export const appRouter = router({
  auth: authRouter,
  timers: timersRouter,
});

export type AppRouter = typeof appRouter;

const app = Fastify({ logger: true });

app.register(cors, {
  origin: ["https://localhost:5174", "https://counter-weight.app"],
  credentials: true,
});

app.addHook("onSend", (_req, _reply, payload, done) => {
  console.log("[onSend] payload:", payload);
  done(null, payload);
});

app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
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
