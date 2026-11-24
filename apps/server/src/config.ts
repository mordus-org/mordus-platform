import type { env } from "@mordus-platform/env/server";

export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  adminToken?: string;
  rateLimit: number;
  logLevel: string;
  logDir?: string;
  corsOrigin?: string;
}

export function loadConfig(values: typeof env): Config {
  return {
    host: values.HOST,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    adminToken: values.ADMIN_TOKEN,
    rateLimit: values.COLLECT_RATE_LIMIT,
    logLevel: values.LOG_LEVEL,
    logDir: values.LOG_DIR,
    corsOrigin: values.CORS_ORIGIN,
  };
}
