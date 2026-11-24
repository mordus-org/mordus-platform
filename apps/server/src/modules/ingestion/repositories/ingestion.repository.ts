import { randomUUID } from "node:crypto";
import type { Database } from "@mordus-platform/db/postgres";

import type { MonitorEvent } from "../../../core/types";

export class IngestionRepository {
  constructor(private readonly database: Database) {}

  async persistBatch(project: { id: string; name: string }, events: MonitorEvent[]): Promise<void> {
    await this.database.transaction(async (connection) => {
      await connection.query(
        "INSERT INTO projects (project_id, name) VALUES ($1, $2) ON CONFLICT (project_id) DO NOTHING",
        [project.id, project.name],
      );
      for (const event of events) {
        let userKey: string | null = null;
        if (event.userId) {
          await connection.query(
            "INSERT INTO users (project_id, user_id, user_key) VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO NOTHING",
            [project.id, event.userId, `usr_${randomUUID()}`],
          );
          const result = await connection.query<{ user_key: string }>(
            "SELECT user_key FROM users WHERE project_id = $1 AND user_id = $2",
            [project.id, event.userId],
          );
          userKey = result.rows[0]?.user_key ?? null;
        }
        await connection.query(
          "INSERT INTO events (project_id, event_id, user_id, user_key, session_id, event_timestamp, category, type, source, page, event_payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) ON CONFLICT (project_id, event_id) DO NOTHING",
          [
            event.projectId,
            event.eventId,
            event.userId ?? null,
            userKey,
            event.sessionId,
            event.timestamp,
            event.category,
            event.type,
            event.source,
            JSON.stringify(event.page),
            JSON.stringify(event),
          ],
        );
      }
    });
  }
}
