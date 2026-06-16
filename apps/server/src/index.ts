import { serve } from "@hono/node-server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { portfolioAgent } from "./agents/portfolio";
import { env } from "@overly-chat/env/server";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.post("/chat", async (c) => {
  const {
    messages,
  }: {
    messages: UIMessage[];
  } = await c.req.json();
  return createAgentUIStreamResponse({
    agent: portfolioAgent,
    uiMessages: messages,
  });
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
