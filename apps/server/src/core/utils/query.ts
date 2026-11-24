import type { FastifyRequest } from "fastify";
import { ApiError } from "../errors/error-handler";
import { cursorSchema, paginationQuerySchema, periodQuerySchema } from "../schemas/tracking";

export interface Period {
  from: Date;
  to: Date;
}

export function parsePeriod(query: Record<string, unknown>): Period {
  const parsedQuery = periodQuerySchema.safeParse(query);
  if (!parsedQuery.success) throw new ApiError(400, "INVALID_PERIOD", "Period query is invalid");
  const { from: fromValue, to: toValue } = parsedQuery.data;
  if ((fromValue === undefined) !== (toValue === undefined))
    throw new ApiError(400, "INVALID_PERIOD", "from and to must be provided together");
  const to = toValue === undefined ? new Date() : new Date(String(toValue));
  const from =
    fromValue === undefined
      ? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(String(fromValue));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()))
    throw new ApiError(400, "INVALID_PERIOD", "from and to must be valid ISO 8601 timestamps");
  if (
    from.toISOString() !== String(fromValue ?? from.toISOString()) ||
    to.toISOString() !== String(toValue ?? to.toISOString())
  )
    throw new ApiError(400, "INVALID_PERIOD", "from and to must use ISO 8601 UTC format");
  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > 90 * 24 * 60 * 60 * 1000)
    throw new ApiError(
      400,
      "INVALID_PERIOD",
      "The period must be positive and no longer than 90 days",
    );
  return { from, to };
}

export function pagination(query: Record<string, unknown>) {
  const parsedQuery = paginationQuerySchema.safeParse(query);
  if (!parsedQuery.success)
    throw new ApiError(400, "INVALID_PAGINATION", "limit must be an integer between 1 and 100");
  const { limit: limitValue, cursor } = parsedQuery.data;
  const limit = limitValue === undefined ? 50 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ApiError(400, "INVALID_PAGINATION", "limit must be an integer between 1 and 100");
  let offset = 0;
  if (cursor !== undefined) {
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      offset = cursorSchema.parse(value).offset;
    } catch {
      throw new ApiError(400, "INVALID_CURSOR", "cursor is invalid");
    }
  }
  return { offset, limit };
}

export function paginate<T>(items: T[], query: Record<string, unknown>) {
  const { offset, limit } = pagination(query);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor:
      nextOffset < items.length
        ? Buffer.from(JSON.stringify({ offset: nextOffset })).toString("base64url")
        : null,
  };
}

export function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
}
