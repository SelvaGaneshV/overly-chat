import { serve } from "@hono/node-server";
import { env } from "@overly-chat/env/server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createPortfolioAgent } from "./agents/portfolio";

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
    agent: createPortfolioAgent(),
    uiMessages: messages,
  });
});

// app.get("/models", async () => {
//   const config = resolveConfig();
//   const res = await fetch("https://openrouter.ai/api/v1/models", {
//     method: "GET",
//     headers: {
//       Authorization: `Bearer ${config.apiKey}`,
//     },
//   });
//   if (!res.ok) throw new HTTPException(500);
//   const { data = { data:rawModels } } = (await res.json()) as {
//     data: ModelsListResponse;
//   };
//   const models = rawModel;
// });

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
