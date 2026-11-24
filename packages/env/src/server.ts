import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { serverSchema } from "./server-schema";

// Load monorepo package env relative to this file (not process.cwd()).
// Turbo/`bun run` from the workspace root would otherwise miss apps/*/ .env.
const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/server/.env");
config({ path: envFilePath });

export const env = createEnv({
  server: serverSchema,
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
