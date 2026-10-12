import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(38880),
    HOST: z.string().default("127.0.0.1"),
    OVERLY_SESSION_TOKEN: z.string().optional(),
    CORS_ORIGIN: z.url().default("http://localhost:38881"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
