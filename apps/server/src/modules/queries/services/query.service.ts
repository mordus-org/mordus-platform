import { ApiError } from "../../../core/errors/error-handler";
import { contextIdentifierSchema } from "../../../core/schemas/tracking";
import type { Period } from "../../../core/utils/query";
import type { SettingsRepository } from "../../admin/settings.repository";
import { QueryRepository, type TimelineRow } from "../repositories/query.repository";

function nextCursor(offset: number, hasMore: boolean): string | null {
  return hasMore ? Buffer.from(JSON.stringify({ offset })).toString("base64url") : null;
}

export class QueryService {
  constructor(
    private readonly repository: QueryRepository,
    private readonly settings: SettingsRepository,
  ) {}

  private async requireToken(token: string) {
    const project = await this.settings.project();
    if (!project) throw new ApiError(503, "NOT_CONFIGURED", "Project is not configured");
    if (!(await this.settings.hasToken(token)))
      throw new ApiError(401, "UNAUTHORIZED", "A valid bearer token is required");
    return project;
  }

  private async project(token: string, projectId: string): Promise<void> {
    const project = await this.requireToken(token);
    if (projectId !== project.id)
      throw new ApiError(403, "FORBIDDEN", "The token cannot access this project");
  }

  private async user(projectId: string, userKey: string): Promise<void> {
    const result = await this.repository.userExists(projectId, userKey);
    if (result.rowCount === 0)
      throw new ApiError(404, "NOT_FOUND", "User was not found in this project");
  }

  async projects(token: string) {
    const project = await this.requireToken(token);
    const result = await this.repository.listProjects(project.id);
    return result.rows.map(({ project_id, name }) => ({
      projectId: project_id,
      name,
    }));
  }

  async users(token: string, projectId: string, period: Period, limit: number, offset: number) {
    await this.project(token, projectId);
    const result = await this.repository.listUsers(projectId, period, limit + 1, offset);
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit).map((row) => ({
      userKey: row.user_key,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      sessions: Number(row.sessions),
      actions: Number(row.actions),
    }));
    return { items, nextCursor: nextCursor(offset + items.length, hasMore) };
  }

  async lookup(token: string, projectId: string, userId: string) {
    await this.project(token, projectId);
    if (!contextIdentifierSchema.safeParse(userId).success)
      throw new ApiError(400, "INVALID_USER_ID", "userId has an invalid format");
    const result = await this.repository.findUserKey(projectId, userId);
    if (!result.rows[0])
      throw new ApiError(404, "NOT_FOUND", "User ID was not observed in this project");
    return { userKey: result.rows[0].user_key };
  }

  async summary(token: string, projectId: string, userKey: string, period: Period) {
    await this.project(token, projectId);
    await this.user(projectId, userKey);
    const result = await this.repository.eventsForUser(projectId, userKey, period);
    const events = result.rows.map((row) => row.event_payload);
    const daily = new Map<string, { pageViews: number; actions: number }>();
    const pages = new Map<string, { views: number; lastUsedAt: string }>();
    const actions = new Map<string, { count: number; lastUsedAt: string }>();
    const sessions = new Set<string>();
    let lastSeenAt: string | null = null;
    for (const event of events) {
      if (lastSeenAt === null || Date.parse(event.timestamp) > Date.parse(lastSeenAt))
        lastSeenAt = event.timestamp;
      sessions.add(event.sessionId);
      const day = event.timestamp.slice(0, 10);
      const dailyRow = daily.get(day) ?? { pageViews: 0, actions: 0 };
      if (event.type === "page.view") {
        dailyRow.pageViews += 1;
        const page = event.page.route ?? event.page.path;
        const rank = pages.get(page) ?? {
          views: 0,
          lastUsedAt: event.timestamp,
        };
        rank.views += 1;
        if (event.timestamp > rank.lastUsedAt) rank.lastUsedAt = event.timestamp;
        pages.set(page, rank);
      }
      if (event.source === "manual" && event.category === "custom") {
        dailyRow.actions += 1;
        const rank = actions.get(event.type) ?? {
          count: 0,
          lastUsedAt: event.timestamp,
        };
        rank.count += 1;
        if (event.timestamp > rank.lastUsedAt) rank.lastUsedAt = event.timestamp;
        actions.set(event.type, rank);
      }
      daily.set(day, dailyRow);
    }
    const dailyActivity = [...daily]

      .sort(([left], [right]) => left.localeCompare(right))

      .map(([date, value]) => ({ date, ...value }));
    const topPages = [...pages]

      .map(([page, value]) => ({ page, ...value }))

      .sort((left, right) => right.views - left.views || left.page.localeCompare(right.page))

      .slice(0, 10);
    const topActions = [...actions]

      .map(([type, value]) => ({ type, ...value }))

      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))

      .slice(0, 10);
    return {
      activeDays: daily.size,
      sessions: sessions.size,
      pageViews: dailyActivity.reduce((sum, row) => sum + row.pageViews, 0),
      actions: dailyActivity.reduce((sum, row) => sum + row.actions, 0),
      lastSeenAt,
      dailyActivity,
      topPages,
      topActions,
    };
  }

  async sessions(
    token: string,
    projectId: string,
    userKey: string,
    period: Period,
    limit: number,
    offset: number,
  ) {
    await this.project(token, projectId);
    await this.user(projectId, userKey);
    const result = await this.repository.listSessions(
      projectId,
      userKey,
      period,
      limit + 1,
      offset,
    );
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit).map((row) => ({
      sessionId: row.session_id,
      firstEventAt: new Date(row.first_event_at).toISOString(),
      lastEventAt: new Date(row.last_event_at).toISOString(),
      eventCount: Number(row.event_count),
    }));
    return { items, nextCursor: nextCursor(offset + items.length, hasMore) };
  }

  async timeline(
    token: string,
    projectId: string,
    userKey: string,
    sessionId: string,
    period: Period,
    limit: number,
    offset: number,
  ) {
    await this.project(token, projectId);
    await this.user(projectId, userKey);
    const [result, exists] = await Promise.all([
      this.repository.sessionEvents(projectId, userKey, sessionId, period, limit + 1, offset),
      this.repository.sessionExists(projectId, userKey, sessionId, period),
    ]);
    if (exists.rowCount === 0)
      throw new ApiError(404, "NOT_FOUND", "Session was not found in this project and period");
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit).map((row: TimelineRow) => ({
      eventId: row.event_id,
      timestamp: new Date(row.event_timestamp).toISOString(),
      category: row.category,
      type: row.type,
      page: row.page,
    }));
    return { items, nextCursor: nextCursor(offset + items.length, hasMore) };
  }
}
