import type { FastifyInstance } from "fastify";
import { ApiError, sendError } from "../errors/error-handler";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof ApiError
        ? error.statusCode
        : Number((error as { statusCode?: number }).statusCode ?? 500);
    const code =
      error instanceof ApiError
        ? error.code
        : status === 413
          ? "PAYLOAD_TOO_LARGE"
          : status === 415
            ? "UNSUPPORTED_MEDIA_TYPE"
            : status === 400
              ? "BAD_REQUEST"
              : "INTERNAL_ERROR";
    const message =
      status >= 500
        ? "An unexpected error occurred"
        : error instanceof Error
          ? error.message
          : "Request failed";

    request.log.error({ err: error, statusCode: status, errorCode: code }, "Request failed");
    return sendError(reply, request, status, code, message);
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, request, 404, "NOT_FOUND", "Route was not found"),
  );
}
