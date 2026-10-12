# Overly

Overly is a transparent AI assistant that floats above your desktop. It stays on top while you work, stays invisible on screen shares, and disappears into a small bubble when you need space.

## Why Overly

Most AI tools make you switch tabs or share your screen to get help. Overly sits quietly above your work, so you can ask a question, understand what is on your screen, or fix an error without breaking your flow.

## Features

- **Always on top, never in the way.** Overly floats above your windows. Collapse it to a small bubble and bring it back instantly when you need it.
- **Invisible on screen shares.** It stays hidden from the taskbar and does not show up in Teams, Meet, OBS, or screen recordings.
- **Ask about what you see.** Take a screenshot of your screen or a single window and ask Overly to explain it, summarize it, or help you reply to it.
- **Four assistants in one.** Switch between General Copilot, Coding Copilot, Meeting Whisperer, and Portfolio Mode, or add your own instructions to change how it responds.
- **Bring your own model.** Connect your OpenRouter key once, then pick from available free models or enter any model ID you prefer.
- **Live web answers.** Turn on Search when you want current information, with sources included in the answer.
- **Hands-on help for developers.** Overly can run terminal commands for you, with your permission, to check files, run builds and tests, or look at git status.
- **Aware of your workspace.** If you allow it, Overly can see which windows you have open so its answers fit what you are doing.
- **Your history is saved.** Reopen past conversations, start fresh anytime, copy answers, or download a chat as Markdown.
- **Make it yours.** Control whether Overly stays on top, adjust its transparency, and snap it to any side of your screen.

## Getting started

1. Install Overly and open it.
2. When asked, paste your OpenRouter API key. You only need to do this once.
3. Pick a persona and model, then start chatting.

Tip: press the shortcut to summon Overly, snip your screen, and ask “what does this mean?”

## Shortcuts

| Shortcut               | What it does              |
| ---------------------- | ------------------------- |
| `Ctrl/Cmd+Shift+Space` | Show, hide, or bring back Overly |
| `Ctrl/Cmd+Shift+P`     | Turn Ghost Mode on or off |
| `Ctrl/Cmd+K`           | Turn web search on or off |
| `Escape`               | Stop the current response |
| `Ctrl/Cmd+Q`           | Quit Overly               |
| `Ctrl/Cmd+Shift+I`     | Open developer tools      |

## Settings

- **Window:** always-on-top, transparency, and bubble behavior.
- **AI and models:** API key, persona, model, custom instructions, working folder, and window sharing.
- **Shortcuts:** see every shortcut in one place.

## Privacy

- Your API key is encrypted and stored securely using your operating system’s keychain.
- Screen captures and window titles are only shared when you choose to share them.
- Overly runs locally on your machine and talks directly to the model provider you select.

## For developers

Want to run Overly from source? You will need Node.js 18+, pnpm 11+, and an OpenRouter API key.

```bash
pnpm install
pnpm dev
```

To package the desktop installer, run:

```bash
pnpm desktop
```
