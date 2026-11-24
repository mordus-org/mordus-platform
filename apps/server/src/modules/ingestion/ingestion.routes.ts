import type { FastifyInstance } from "fastify";
import type { Config } from "../../config";
import { ApiError } from "../../core/errors/error-handler";
import { IngestionService } from "./services/ingestion.service";

export async function registerIngestionRouter(
  app: FastifyInstance,
  service: IngestionService,
  config: Config,
): Promise<void> {
  const requests = new Map<string, { count: number; expiresAt: number }>();

  app.options<{ Params: { collectionId: string } }>(
    "/v1/collect/:collectionId",
    async (request, reply) => {
      const collection = await service.findCollection(request.params.collectionId);
      const origin = request.headers.origin;
      if (origin && !collection.origins.includes(origin))
        throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
      if (origin)
        reply

          .header("Access-Control-Allow-Origin", origin)

          .header("Vary", "Origin");
      return reply

        .header("Access-Control-Allow-Methods", "POST, OPTIONS")

        .header("Access-Control-Allow-Headers", "Content-Type")

        .code(204)

        .send();
    },
  );

  app.post<{ Params: { collectionId: string }; Body: unknown }>(
    "/v1/collect/:collectionId",
    async (request, reply) => {
      const collection = await service.findCollection(request.params.collectionId);
      const origin = request.headers.origin;
      if (origin && !collection.origins.includes(origin))
        throw new ApiError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
      if (origin)
        reply

          .header("Access-Control-Allow-Origin", origin)

          .header("Vary", "Origin");

      const now = Date.now();
      const current = requests.get(request.ip);
      if (current && current.expiresAt > now && current.count >= config.rateLimit)
        throw new ApiError(429, "RATE_LIMITED", "Collection rate limit exceeded");
      requests.set(
        request.ip,
        current && current.expiresAt > now
          ? { count: current.count + 1, expiresAt: current.expiresAt }
          : { count: 1, expiresAt: now + 60_000 },
      );

      try {
        const eventCount = await service.collect(request.body);
        request.log.info({ eventCount }, "Tracking batch accepted");
      } catch (error) {
        if (error instanceof ApiError) throw error;
        request.log.error({ err: error }, "Tracking batch could not be persisted");
        throw new ApiError(
          503,
          "SERVICE_UNAVAILABLE",
          "Tracking storage is temporarily unavailable",
        );
      }
      return reply.code(204).send();
    },
  );
}
