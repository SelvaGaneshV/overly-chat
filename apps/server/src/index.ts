import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { env } from "@overly-chat/env/server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createCopilotAgent, PERSONAS, resolveConfig, setInMemoryConfig } from "./agents/agent";

const resolveSessionToken = (): string => {
  if (process.env.OVERLY_SESSION_TOKEN) return process.env.OVERLY_SESSION_TOKEN;
  if (env.OVERLY_SESSION_TOKEN) return env.OVERLY_SESSION_TOKEN;
  const tokenFile = path.join(os.tmpdir(), "overly-dev-session.token");
  try {
    const existing = fs.readFileSync(tokenFile, "utf-8").trim();
    if (existing) return existing;
  } catch {}
  const newToken = crypto.randomUUID();
  try {
    fs.writeFileSync(tokenFile, newToken, { encoding: "utf-8", mode: 0o600 });
  } catch {}
  return newToken;
};

const sessionToken = resolveSessionToken();

// Listen for in-memory config updates over Node.js IPC pipe (when forked by Electron)
if (typeof process.on === "function") {
  process.on("message", (msg: unknown) => {
    if (msg && typeof msg === "object" && (msg as { type?: string }).type === "SET_CONFIG") {
      const cfg = (msg as { config?: Record<string, string> }).config;
      if (cfg) {
        setInMemoryConfig(cfg);
        cachedFreeModels = null;
        lastModelsFetch = 0;
      }
    }
  });
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return env.CORS_ORIGIN;
      if (origin === env.CORS_ORIGIN) return origin;
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return env.CORS_ORIGIN;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-overly-token"],
  }),
);

// Require session token authentication on all protected routes with constant-time comparison
app.use("/*", async (c, next) => {
  if (c.req.method === "OPTIONS" || c.req.path === "/health") {
    return next();
  }
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : c.req.header("x-overly-token");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const tokenBuf = Buffer.from(token);
  const sessionBuf = Buffer.from(sessionToken);
  if (tokenBuf.length !== sessionBuf.length || !crypto.timingSafeEqual(tokenBuf, sessionBuf)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

// In-memory config sync endpoint for standalone dev server
app.post("/internal/config", async (c) => {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object") {
      setInMemoryConfig(body);
      cachedFreeModels = null;
      lastModelsFetch = 0;
      return c.json({ ok: true });
    }
    return c.json({ error: "Invalid config object" }, 400);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/personas", (c) => {
  const list = Object.entries(PERSONAS).map(([id, p]) => ({
    id,
    name: p.name,
  }));
  return c.json({ personas: list });
});

interface FreeModel {
  id: string;
  name: string;
  context_length: number;
  description: string;
}

let cachedFreeModels: FreeModel[] | null = null;
let lastModelsFetch = 0;
let cachedApiKey = "";
let inFlightModelsFetch: Promise<FreeModel[] | null> | null = null;

const isFreeModel = (m: any): boolean => {
  if (!m || typeof m !== "object") return false;
  const id = typeof m.id === "string" ? m.id.toLowerCase() : "";
  if (id.endsWith(":free") || id === "openrouter/free") return true;

  const prompt = Number(m.pricing?.prompt ?? -1);
  const completion = Number(m.pricing?.completion ?? -1);
  const request = Number(m.pricing?.request ?? 0);
  return prompt === 0 && completion === 0 && request === 0;
};

app.get("/models", async (c) => {
  const config = resolveConfig();
  const now = Date.now();

  if (
    cachedFreeModels &&
    cachedApiKey === config.apiKey &&
    now - lastModelsFetch < 1000 * 60 * 15
  ) {
    return c.json({ models: cachedFreeModels });
  }

  if (inFlightModelsFetch) {
    const models = await inFlightModelsFetch;
    return c.json({ models: models ?? cachedFreeModels ?? [] });
  }

  inFlightModelsFetch = (async () => {
    try {
      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }

      const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<any> };
        if (Array.isArray(json.data) && json.data.length > 0) {
          const freeModels: FreeModel[] = json.data.filter(isFreeModel).map((m) => ({
            id: m.id,
            name: m.name || m.id,
            context_length: typeof m.context_length === "number" ? m.context_length : 32768,
            description: m.description || "Free model via OpenRouter",
          }));

          freeModels.sort((a, b) => {
            if (a.id === "openrouter/free") return -1;
            if (b.id === "openrouter/free") return 1;
            return a.name.localeCompare(b.name);
          });

          cachedFreeModels = freeModels;
          cachedApiKey = config.apiKey;
          lastModelsFetch = Date.now();
          return freeModels;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch live OpenRouter free models:", err);
    } finally {
      inFlightModelsFetch = null;
    }
    return cachedFreeModels;
  })();

  const models = await inFlightModelsFetch;
  return c.json({ models: models ?? [] });
});

app.post("/chat", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = body as {
    messages?: UIMessage[];
    webSearch?: boolean;
    model?: string;
    persona?: string;
    instructions?: string;
    openWindows?: Array<{ id: string; name: string }>;
    terminalAccess?: boolean;
    workingDir?: string;
    body?: {
      webSearch?: boolean;
      model?: string;
      persona?: string;
      instructions?: string;
      openWindows?: Array<{ id: string; name: string }>;
      terminalAccess?: boolean;
      workingDir?: string;
    };
  };

  const { messages } = parsed;
  const webSearch = parsed.webSearch ?? parsed.body?.webSearch ?? false;
  const model = parsed.model ?? parsed.body?.model;
  const persona = parsed.persona ?? parsed.body?.persona;
  const instructions = parsed.instructions ?? parsed.body?.instructions;
  const openWindows = parsed.openWindows ?? parsed.body?.openWindows;
  const terminalAccess = parsed.terminalAccess ?? parsed.body?.terminalAccess ?? false;
  const workingDir = parsed.workingDir ?? parsed.body?.workingDir;

  if (!Array.isArray(messages)) {
    return c.json({ error: "`messages` must be an array" }, 400);
  }

  try {
    return createAgentUIStreamResponse({
      agent: createCopilotAgent({
        webSearch,
        model,
        persona,
        instructions,
        openWindows,
        terminalAccess,
        workingDir,
      }),
      uiMessages: messages,
    });
  } catch (err) {
    console.error("chat failed", err);
    const message = err instanceof Error ? err.message : "Failed to generate response";
    return c.json({ error: message }, 500);
  }
});

const serverPort = process.env.PORT !== undefined ? Number(process.env.PORT) : env.PORT;
const serverHost = process.env.HOST || env.HOST || "127.0.0.1";

serve(
  {
    fetch: app.fetch,
    port: serverPort,
    hostname: serverHost,
  },
  (info) => {
    console.log(`Server is running on http://${info.address}:${info.port}`);
    if (typeof process.send === "function") {
      process.send({ type: "ready", port: info.port });
      process.send("ready");
    }
  },
);
