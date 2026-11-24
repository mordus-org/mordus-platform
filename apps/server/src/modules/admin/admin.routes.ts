import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import * as z from "zod";
import { ApiError } from "../../core/errors/error-handler";
import { SettingsRepository } from "./settings.repository";

const projectSchema = z.object({
  projectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  name: z.string().min(1).max(200),
});
const collectionSchema = z.object({
  origins: z.array(z.string().url()),
});

export async function registerAdminRoutes(
  app: FastifyInstance,
  settings: SettingsRepository,
  adminToken: string | undefined,
): Promise<void> {
  const authorize = async (request: FastifyRequest) => {
    const supplied = request.headers.authorization ?? "";
    const expected = `Bearer ${adminToken ?? ""}`;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      !adminToken ||
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    )
      throw new ApiError(401, "UNAUTHORIZED", "A valid admin token is required");
  };

  await app.register(
    async (admin) => {
      admin.addHook("onRequest", authorize);
      admin.get("/project", async () => {
        const project = await settings.project();
        return {
          data: project ? { projectId: project.id, name: project.name } : null,
          error: null,
        };
      });
      admin.put("/project", async (request) => {
        const parsed = projectSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ApiError(400, "INVALID_PROJECT", "Invalid project configuration");
        await settings.setProject(parsed.data.projectId, parsed.data.name);
        return {
          data: { projectId: parsed.data.projectId, name: parsed.data.name },
          error: null,
        };
      });
      admin.get("/collections", async () => ({
        data: await settings.collections(),
        error: null,
      }));
      admin.put<{ Params: { collectionId: string } }>(
        "/collections/:collectionId",
        async (request) => {
          const parsed = collectionSchema.safeParse(request.body);
          if (!parsed.success)
            throw new ApiError(400, "INVALID_COLLECTION", "Invalid collection configuration");
          await settings.setCollection(request.params.collectionId, parsed.data.origins);
          return {
            data: {
              collectionId: request.params.collectionId,
              origins: parsed.data.origins,
            },
            error: null,
          };
        },
      );
      admin.delete<{ Params: { collectionId: string } }>(
        "/collections/:collectionId",
        async (request) => {
          await settings.deleteCollection(request.params.collectionId);
          return { data: { deleted: true }, error: null };
        },
      );
      admin.get("/tokens", async () => ({
        data: await settings.tokens(),
        error: null,
      }));
      admin.post("/tokens", async (_request, reply) => {
        const issued = await settings.createToken();
        reply.header("Cache-Control", "no-store");
        return { data: issued, error: null };
      });
      admin.delete<{ Params: { tokenId: string } }>("/tokens/:tokenId", async (request) => {
        await settings.deleteToken(request.params.tokenId);
        return { data: { deleted: true }, error: null };
      });
    },
    { prefix: "/v1/admin" },
  );
}
