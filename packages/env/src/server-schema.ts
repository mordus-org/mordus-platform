import { z } from "zod";

export const serverSchema = {
  DATABASE_URL: z.url(),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  ADMIN_TOKEN: z.string().min(1).optional(),
  COLLECT_RATE_LIMIT: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_DIR: z.string().min(1).default("./logs"),

  CORS_ORIGIN: z.url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
};
