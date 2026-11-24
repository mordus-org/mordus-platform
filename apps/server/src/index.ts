import { fileURLToPath } from "node:url";

import { env } from "@mordus-platform/env/server";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig(env);
const app = await buildApp(config, undefined, {
  logBaseDir: fileURLToPath(new URL("../../../", import.meta.url)),
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  throw error;
}

const shutdown = () => {
  void app.close().catch((error) => {
    app.log.error(error);
    process.exitCode = 1;
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
