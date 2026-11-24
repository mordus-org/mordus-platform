import type { FastifyInstance } from "fastify";
import type { Database } from "@mordus-platform/db/postgres";
import { QueryRepository } from "./repositories/query.repository";
import { QueryService } from "./services/query.service";
import { registerQueryRouter } from "./queries.routes";
import type { SettingsRepository } from "../admin/settings.repository";

export function createQueriesModule(database: Database, settings: SettingsRepository) {
  const service = new QueryService(new QueryRepository(database), settings);
  return {
    registerRouter: (app: FastifyInstance) => registerQueryRouter(app, service),
  };
}
