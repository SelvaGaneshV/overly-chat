import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ToolLoopAgent } from "ai";
import fs from "node:fs";
import path from "node:path";

interface ServerConfig {
  apiKey: string;
  model: string;
  instructions: string;
  persona?: string;
}

const defaultPortfolioInstructions = `You are a software engineer and full-stack developer, You have approximately 2.7 years of professional experience , where you build a low-code platform.

Your personality: You are passionate about turning ideas into products that make everyday work easier. You enjoy music and gaming in your downtime. You're friendly, knowledgeable, and speak from first-hand experience.

Your core skills:
- Frontend: React, React Native, TypeScript, JavaScript, HTML, CSS, Tailwind CSS, Reactflow, Zustand, ShadCN, Vite
- Backend: Nest.js, Hono, Microservices
- Databases: MongoDB, SQLite, PostgreSQL
- Tools & Libraries: Tanstack Router, Tanstack Query, Drizzle ORM, Redis, Socket.IO, Lodash

Your key experience:
- Led frontend development for an enterprise low-code platform with a WYSIWYG layout editor, real-time multi-user collaboration, and schema-driven plugin architecture
- Implemented workflow orchestration, dependency detection, and multi-tenant artifact persistence across 35+ REST APIs

Your notable projects:
1. Torus — Enterprise low-code platform (live at Torus Innovations)
2. ColorCraft Paint Visualizer — A paint color visualization web app
3. Vezal.db — A visual database exploration tool (in progress)

Answer questions about yourself, your experience, your projects, and your technical skills. If asked to write code or give technical advice, do so with the expertise of a seasoned React/full-stack developer. Stay in character at all times.`;

export const PERSONAS: Record<string, { name: string; instructions: string }> = {
  general: {
    name: "General Copilot",
    instructions: `You are Overly, an intelligent, unobtrusive desktop AI assistant that stays above windows and out of the user's way.
Personality: Helpful, concise, fast, and pragmatic.
Formatting: Use clean GitHub Flavored Markdown with appropriate headers, bullet points, and code blocks. Avoid filler phrases like "Sure, I can help with that!". Provide direct answers.`,
  },
  coder: {
    name: "Coding Copilot",
    instructions: `You are Overly Coding Copilot, an elite senior full-stack engineer and debugger.
Core approach:
- Directly analyze code, stack traces, compiler errors, or screenshots.
- Provide clean, correct, minimal diffs or replacement snippets with accurate syntax highlighting.
- Provide bash/cmd commands when relevant.
- Be extremely concise; explain the root cause in 1-2 sentences before or after the code snippet.`,
  },
  meeting: {
    name: "Meeting & Interview Whisperer",
    instructions: `You are Overly Stealth Copilot for professional calls, meetings, and interviews.
Guidelines:
- Deliver rapid, high-impact bullet points and succinct talking points.
- Structure answers so they can be read at a glance in 3 seconds.
- Provide definitions, key metrics, pros/cons, and follow-up ideas concisely.
- Zero fluff, maximum clarity.`,
  },
  portfolio: {
    name: "Portfolio Mode",
    instructions: defaultPortfolioInstructions,
  },
};

export const resolveConfig = (explicitApiKey?: string): ServerConfig => {
  let fileConfig: Partial<ServerConfig> = {};

  const candidates: string[] = [];
  if (process.env.SERVER_CONFIG_PATH) {
    candidates.push(process.env.SERVER_CONFIG_PATH);
  }

  // Current working directory and server directory
  candidates.push(path.join(process.cwd(), "server-config.json"));
  candidates.push(path.join(process.cwd(), "apps", "server", "server-config.json"));

  // Standard OS userData paths for Electron
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME || "", "Library", "Application Support")
      : path.join(process.env.HOME || "", ".config"));

  if (appData) {
    candidates.push(path.join(appData, "Overly Chat", "config.json"));
    candidates.push(path.join(appData, "Overly Chat", "server-config.json"));
    candidates.push(path.join(appData, "Overly", "config.json"));
    candidates.push(path.join(appData, "Overly", "server-config.json"));
    candidates.push(path.join(appData, "overly-chat", "config.json"));
    candidates.push(path.join(appData, "overly-chat", "server-config.json"));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const candidateKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
          const isEncrypted =
            candidateKey.length > 50 &&
            candidateKey.includes("/") &&
            candidateKey.includes("+") &&
            candidateKey.endsWith("=");
          const isUsableKey = candidateKey.length > 0 && !isEncrypted;

          fileConfig = {
            ...fileConfig,
            ...parsed,
            ...(isUsableKey ? { apiKey: candidateKey } : { apiKey: fileConfig.apiKey || "" }),
          };

          if (fileConfig.apiKey) break;
        }
      }
    } catch {
      // Continue checking next candidate
    }
  }

  const resolvedApiKey = (
    explicitApiKey ||
    fileConfig.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    ""
  ).trim();

  return {
    apiKey: resolvedApiKey,
    model: fileConfig.model || process.env.AGENT_MODEL || "openrouter/free",
    instructions: fileConfig.instructions || process.env.AGENT_INSTRUCTIONS || "",
    persona: fileConfig.persona || "general",
  };
};

export interface OpenWindowContext {
  id: string;
  name: string;
}

export interface AgentOptions {
  webSearch?: boolean;
  model?: string;
  persona?: string;
  instructions?: string;
  apiKey?: string;
  openWindows?: OpenWindowContext[];
}

export const createCopilotAgent = (opts?: AgentOptions): ToolLoopAgent => {
  const config = resolveConfig(opts?.apiKey);
  const apiKey = opts?.apiKey || config.apiKey;
  const openrouter = createOpenRouter({ apiKey });
  const selectedModel = opts?.model || config.model || "openrouter/free";
  const personaKey = opts?.persona || config.persona || "general";
  const personaPrompt =
    PERSONAS[personaKey]?.instructions ||
    PERSONAS["general"]?.instructions ||
    defaultPortfolioInstructions;
  const customInstructions = opts?.instructions || config.instructions;
  const webSearchInstructions = opts?.webSearch
    ? `\n\nWeb search is enabled for this conversation. Ground your answers in current information when relevant and include source URLs inline as markdown links. If you are unsure about recency, say so.`
    : "";

  const windowsInstructions =
    opts?.openWindows && opts.openWindows.length > 0
      ? `\n\nActive Windows on User's Desktop:
The user currently has these application windows open:
${opts.openWindows.map((w, i) => `${i + 1}. "${w.name}"`).join("\n")}
You have direct awareness of the user's open windows. When the user asks what windows they have open, or refers to their code, editor, browser, terminal, or any open app, answer with direct knowledge of these active windows.`
      : "";

  const systemInstructions = customInstructions
    ? `${customInstructions}${webSearchInstructions}${windowsInstructions}`
    : `${personaPrompt}${webSearchInstructions}${windowsInstructions}`;

  return new ToolLoopAgent({
    model: openrouter(selectedModel),
    instructions: systemInstructions,
  });
};

export const createPortfolioAgent = createCopilotAgent;
