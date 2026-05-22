import Fastify from "fastify";
import awsLambdaFastify from "@fastify/aws-lambda";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { authRoutes } from "./routes.js";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: ["http://localhost:5174", "https://counter-weight.app"],
  credentials: true,
});
app.register(cookie);
app.register(authRoutes, { prefix: "/auth" });

export const handler = awsLambdaFastify(app);
