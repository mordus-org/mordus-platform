import type { FastifyInstance } from "fastify";
import type { Config } from "../../config";
import type { Database } from "@mordus-platform/db/postgres";
import { IngestionRepository } from "./repositories/ingestion.repository";
import { IngestionService } from "./services/ingestion.service";
import { registerIngestionRouter } from "./ingestion.routes";
import type { SettingsRepository } from "../admin/settings.repository";

export function createIngestionModule(
  database: Database,
  config: Config,
  settings: SettingsRepository,
) {
  const service = new IngestionService(new IngestionRepository(database), settings);
  return {
    registerRouter: (app: FastifyInstance) => registerIngestionRouter(app, service, config),
  };
}
