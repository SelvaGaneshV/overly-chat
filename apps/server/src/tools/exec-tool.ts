import { tool, type Tool } from "ai";
import { exec } from "node:child_process";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const DANGEROUS_COMMAND_PATTERNS = [
  /\bformat\s+[a-z]:/i,
  /\bdel\s+(?:\/[a-z]\s+)*[a-z]:\\/i,
  /\brmdir\s+\/[sS]\s+\/[qQ]\s+[a-z]:\\/i,
  /\brm\s+-rf?\s+(\/|[a-z]:\\|\*)/i,
  /\b(shutdown|reboot|poweroff|init\s+0)\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:(){ :\|:& };:/,
  /\b(curl|wget)\s+[^|]+\|\s*(sh|bash|powershell|cmd)\b/i,
  /Invoke-Expression\s*\(?.*(Invoke-WebRequest|iwr|curl|wget)/i,
];

const isUncOrRemotePath = (p?: string): boolean => {
  if (!p) return false;
  const trimmed = p.trim();
  return (
    trimmed.startsWith("\\\\") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\??\\") ||
    /^[a-zA-Z]+:\/\//.test(trimmed)
  );
};

const execParams = z.object({
  command: z
    .string()
    .describe("The exact shell command to run. e.g. 'ls -la', 'npm install', 'git status'."),
  cwd: z
    .string()
    .optional()
    .describe(
      "Absolute path of the working directory to run the command in. Defaults to the user's home directory.",
    ),
  description: z
    .string()
    .optional()
    .describe("Brief human-readable description of what this command does (shown to the user)."),
});

export const execTool: Tool = tool({
  description:
    "Execute a terminal/shell command on the user's machine and return its stdout, stderr, and exit code. " +
    "Use this to run scripts, install packages, list directories, read file contents, run tests, check git status, etc. " +
    "Always explain what command you are running and why before calling this tool.",
  inputSchema: execParams,
  execute: async ({ command, cwd }: { command: string; cwd?: string; description?: string }) => {
    // 1. Guard against UNC paths to prevent Windows NetNTLM hash harvesting
    if (isUncOrRemotePath(cwd)) {
      return {
        stdout: "",
        stderr: "Execution blocked: UNC network paths are not permitted as working directories.",
        exitCode: 1,
      };
    }

    if (
      /(\\\\[a-zA-Z0-9_.-]+\\[a-zA-Z0-9_$.-]+|\/\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_$.-]+)/.test(command)
    ) {
      return {
        stdout: "",
        stderr: "Execution blocked: UNC network paths are not permitted in commands.",
        exitCode: 1,
      };
    }

    // 2. Guard against catastrophic destructive commands
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          stdout: "",
          stderr: "Execution blocked: command matched high-risk safety guardrail pattern.",
          exitCode: 1,
        };
      }
    }

    // 3. Resolve and validate working directory
    let resolvedCwd = os.homedir();
    if (cwd) {
      try {
        const normalized = path.resolve(cwd);
        if (
          !isUncOrRemotePath(normalized) &&
          fsSync.existsSync(normalized) &&
          fsSync.statSync(normalized).isDirectory()
        ) {
          resolvedCwd = normalized;
        }
      } catch {
        // Fall back to home directory on any resolution error
      }
    }

    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = exec(
        command,
        {
          cwd: resolvedCwd,
          timeout: 30_000,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        },
        (err, stdout, stderr) => {
          resolve({
            stdout: stdout.slice(0, 20_000),
            stderr: stderr.slice(0, 5_000),
            exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          });
        },
      );
      proc.on("error", (err: Error) => {
        resolve({ stdout: "", stderr: err.message, exitCode: 1 });
      });
    });
  },
});
