# Overly

A fullscreen transparent AI chat overlay for your desktop. Stays on top of every window, invisible to screen sharing, and gets out of your way when you're not using it.

## Features

- Fullscreen transparent overlay — lives above all your windows
- Click-through by default, interactive on hover
- Hidden from taskbar, Alt+Tab, and screen capture (Teams, Meet, OBS)
- Draggable and resizable chat window
- Powered by OpenRouter — bring your own model
- Encrypted API key storage via OS keychain

## Apps

| App | Description |
|-----|-------------|
| `apps/desktop` | Electron shell — overlay window + bundled server |
| `apps/web` | React frontend — chat UI + settings |
| `apps/server` | Hono API server — AI agent endpoint |
| `packages/ui` | Shared component library (shadcn/ui + Tailwind) |
| `packages/env` | Shared env validation (@t3-oss/env-core) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io) 11+
- An [OpenRouter](https://openrouter.ai) API key

### Install

```bash
pnpm install
```

### Environment

`apps/server/.env`
```env
OPENROUTER_API_KEY=sk-or-v1-...
CORS_ORIGIN=http://localhost:3001
```

`apps/web/.env`
```env
VITE_SERVER_URL=http://localhost:3000
```

### Dev

Run everything together:

```bash
pnpm dev
```

Or individually:

```bash
pnpm dev:web       # React frontend on :3001
pnpm dev:server    # Hono server on :3000
pnpm dev:desktop   # Electron app (connects to :3001)
```

### Build & Package

```bash
pnpm dist:desktop
```

Builds the web frontend, bundles the Hono server into the Electron app, and produces a platform installer in `apps/desktop/release/`.

> On first launch the app will prompt you for your OpenRouter API key. It's stored encrypted using the OS keychain.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+Q` | Quit the app |

## Project Structure

```
overly-chat/
├── apps/
│   ├── desktop/     # Electron overlay shell
│   ├── web/         # React frontend (TanStack Router)
│   └── server/      # Hono API server
└── packages/
    ├── ui/          # Shared shadcn/ui components
    └── env/         # Shared env validation
```

## Tech Stack

- **Electron** — desktop shell
- **React** + **TanStack Router** — frontend
- **Hono** + **@hono/node-server** — API server
- **Vercel AI SDK** + **OpenRouter** — AI streaming
- **shadcn/ui** + **Tailwind CSS** — UI components
- **Turborepo** + **pnpm** — monorepo tooling
- **tsdown** — bundler for Electron main process

## UI Components

Shared shadcn/ui primitives live in `packages/ui`. To add more:

```bash
npx shadcn@latest add <component> -c packages/ui
```

Import them in any app:

```tsx
import { Button } from "@overly-chat/ui/components/button";
```
