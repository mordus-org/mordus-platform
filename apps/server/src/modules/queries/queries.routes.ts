import type { FastifyInstance } from "fastify";
import { bearerToken, pagination, parsePeriod } from "../../core/utils/query";
import { ApiError } from "../../core/errors/error-handler";
import { userLookupSchema } from "../../core/schemas/tracking";
import type { QueryService } from "./services/query.service";

interface RouteParams {
  projectId: string;
  userKey: string;
  sessionId: string;
}

export async function registerQueryRouter(
  app: FastifyInstance,
  service: QueryService,
): Promise<void> {
  app.get("/v1/projects", async (request, reply) => {
    const items = await service.projects(bearerToken(request));
    return reply.send({ data: { items }, error: null });
  });

  app.get<{ Params: RouteParams; Querystring: Record<string, unknown> }>(
    "/v1/projects/:projectId/users",
    async (request, reply) => {
      const { limit, offset } = pagination(request.query);
      const data = await service.users(
        bearerToken(request),
        request.params.projectId,
        parsePeriod(request.query),
        limit,
        offset,
      );
      return reply.send({ data, error: null });
    },
  );

  app.post<{ Params: RouteParams; Body: unknown }>(
    "/v1/projects/:projectId/users/lookup",
    async (request, reply) => {
      const body = userLookupSchema.safeParse(request.body);
      if (!body.success)
        throw new ApiError(400, "INVALID_USER_ID", "Body must contain a non-empty userId");
      const data = await service.lookup(
        bearerToken(request),
        request.params.projectId,
        body.data.userId,
      );
      return reply.send({ data, error: null });
    },
  );

  app.get<{ Params: RouteParams; Querystring: Record<string, unknown> }>(
    "/v1/projects/:projectId/users/:userKey/summary",
    async (request, reply) => {
      const data = await service.summary(
        bearerToken(request),
        request.params.projectId,
        request.params.userKey,
        parsePeriod(request.query),
      );
      return reply.send({ data, error: null });
    },
  );

  app.get<{ Params: RouteParams; Querystring: Record<string, unknown> }>(
    "/v1/projects/:projectId/users/:userKey/sessions",
    async (request, reply) => {
      const { limit, offset } = pagination(request.query);
      const data = await service.sessions(
        bearerToken(request),
        request.params.projectId,
        request.params.userKey,
        parsePeriod(request.query),
        limit,
        offset,
      );
      return reply.send({ data, error: null });
    },
  );

  app.get<{ Params: RouteParams; Querystring: Record<string, unknown> }>(
    "/v1/projects/:projectId/users/:userKey/sessions/:sessionId/events",
    async (request, reply) => {
      const { limit, offset } = pagination(request.query);
      const data = await service.timeline(
        bearerToken(request),
        request.params.projectId,
        request.params.userKey,
        request.params.sessionId,
        parsePeriod(request.query),
        limit,
        offset,
      );
      return reply.send({ data, error: null });
    },
  );
}
