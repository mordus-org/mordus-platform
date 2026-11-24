import type { FastifyReply, FastifyRequest } from "fastify";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply
    .code(statusCode)
    .send({ data: null, error: { code, message, requestId: request.id } });
}
