import { fileURLToPath } from "node:url";

export const migrationsFolder = fileURLToPath(
  new URL("../../../packages/db/src/migrations/", import.meta.url),
);
