import fastifyCors from "@fastify/cors";
import { migrationsFolder } from "./migrations";
import { randomUUID } from "node:crypto";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type RawServerDefault,
} from "fastify";
import type { Config } from "./config";
import { registerErrorHandler } from "./core/middlewares/error-handler";
import { createLogger } from "./core/logger";
import { createIngestionModule } from "./modules/ingestion/index";
import { createQueriesModule } from "./modules/queries/index";
import { createPostgresDatabase, type Database } from "@mordus-platform/db/postgres";
import { SettingsRepository } from "./modules/admin/settings.repository";
import { registerAdminRoutes } from "./modules/admin/admin.routes";

export async function buildApp(
  config: Config,
  database?: Database,
  options?: { logBaseDir?: string },
): Promise<FastifyInstance> {
  const db = database ?? (await createPostgresDatabase(config.databaseUrl, migrationsFolder));

  const settings = new SettingsRepository(db);
  const ingestion = createIngestionModule(db, config, settings);
  const queries = createQueriesModule(db, settings);

  const logging = createLogger(config.logLevel, options?.logBaseDir, config.logDir);

  const app: FastifyInstance = Fastify<RawServerDefault>({
    loggerInstance: logging.logger as FastifyBaseLogger,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    bodyLimit: 60 * 1024,
  });

  app.addHook("onClose", async () => {
    await logging.close();
    if (!database) await db.close();
  });

  registerErrorHandler(app);
  if (config.corsOrigin) {
    const origin = config.corsOrigin;
    await app.register(fastifyCors, {
      delegator: (request, callback) =>
        callback(null, {
          origin: request.url.split("?")[0] === "/" ? origin : false,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
          credentials: true,
          maxAge: 86400,
        }),
    });
  }
  app.get("/", async () => "OK");

  await registerAdminRoutes(app, settings, config.adminToken);

  app.get("/health", async (_request, reply) =>
    reply.send({ data: { status: "ok" }, error: null }),
  );

  await ingestion.registerRouter(app);
  await queries.registerRouter(app);

  return app;
}
