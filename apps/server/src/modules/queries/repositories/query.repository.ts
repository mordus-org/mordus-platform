import type { Database } from "@mordus-platform/db/postgres";
import type { Period } from "../../../core/utils/query";
import type { MonitorEvent } from "../../../core/types";

export interface UserActivityRow {
  user_key: string;
  last_seen_at: Date;
  sessions: string;
  actions: string;
}

export interface SessionRow {
  session_id: string;
  first_event_at: Date;
  last_event_at: Date;
  event_count: string;
}

export interface TimelineRow {
  event_id: string;
  event_timestamp: Date;
  category: string;
  type: string;
  page: MonitorEvent["page"];
}

export class QueryRepository {
  constructor(private readonly database: Database) {}

  listProjects(projectId: string) {
    return this.database.query<{ project_id: string; name: string }>(
      "SELECT project_id, name FROM projects WHERE project_id = $1",
      [projectId],
    );
  }

  listUsers(projectId: string, period: Period, limit: number, offset: number) {
    return this.database.query<UserActivityRow>(
      `SELECT user_key, MAX(event_timestamp) AS last_seen_at, COUNT(DISTINCT session_id)::text AS sessions,
      COUNT(*) FILTER (WHERE source = 'manual' AND category = 'custom')::text AS actions
      FROM events WHERE project_id = $1 AND user_key IS NOT NULL AND event_timestamp >= $2 AND event_timestamp < $3
      GROUP BY user_key ORDER BY last_seen_at DESC, user_key ASC LIMIT $4 OFFSET $5`,
      [projectId, period.from.toISOString(), period.to.toISOString(), limit, offset],
    );
  }

  findUserKey(projectId: string, userId: string) {
    return this.database.query<{ user_key: string }>(
      "SELECT user_key FROM users WHERE project_id = $1 AND user_id = $2",
      [projectId, userId],
    );
  }

  userExists(projectId: string, userKey: string) {
    return this.database.query("SELECT 1 FROM users WHERE project_id = $1 AND user_key = $2", [
      projectId,
      userKey,
    ]);
  }

  eventsForUser(projectId: string, userKey: string, period: Period) {
    return this.database.query<{ event_payload: MonitorEvent }>(
      "SELECT event_payload FROM events WHERE project_id = $1 AND user_key = $2 AND event_timestamp >= $3 AND event_timestamp < $4",
      [projectId, userKey, period.from.toISOString(), period.to.toISOString()],
    );
  }

  listSessions(projectId: string, userKey: string, period: Period, limit: number, offset: number) {
    return this.database.query<SessionRow>(
      `SELECT session_id, MIN(event_timestamp) AS first_event_at, MAX(event_timestamp) AS last_event_at, COUNT(*)::text AS event_count
      FROM events WHERE project_id = $1 AND user_key = $2 AND event_timestamp >= $3 AND event_timestamp < $4
      GROUP BY session_id ORDER BY last_event_at DESC, session_id ASC LIMIT $5 OFFSET $6`,
      [projectId, userKey, period.from.toISOString(), period.to.toISOString(), limit, offset],
    );
  }

  sessionEvents(
    projectId: string,
    userKey: string,
    sessionId: string,
    period: Period,
    limit: number,
    offset: number,
  ) {
    return this.database.query<TimelineRow>(
      `SELECT event_id, event_timestamp, category, type, page FROM events
      WHERE project_id = $1 AND user_key = $2 AND session_id = $3 AND event_timestamp >= $4 AND event_timestamp < $5
      ORDER BY event_timestamp ASC, event_id ASC LIMIT $6 OFFSET $7`,
      [
        projectId,
        userKey,
        sessionId,
        period.from.toISOString(),
        period.to.toISOString(),
        limit,
        offset,
      ],
    );
  }

  sessionExists(projectId: string, userKey: string, sessionId: string, period: Period) {
    return this.database.query(
      "SELECT 1 FROM events WHERE project_id = $1 AND user_key = $2 AND session_id = $3 AND event_timestamp >= $4 AND event_timestamp < $5 LIMIT 1",
      [projectId, userKey, sessionId, period.from.toISOString(), period.to.toISOString()],
    );
  }
}
