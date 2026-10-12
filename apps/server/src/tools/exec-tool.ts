import { tool, type Tool } from "ai";
import { exec } from "node:child_process";
import fsSync from "node:fs";
import os from "node:os";
import { z } from "zod";

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
    const resolvedCwd = cwd && fsSync.existsSync(cwd) ? cwd : os.homedir();
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
