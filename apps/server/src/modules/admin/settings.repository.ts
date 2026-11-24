import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database } from "@mordus-platform/db/postgres";
import { ApiError } from "../../core/errors/error-handler";

export interface ProjectSettings {
  id: string;
  name: string;
}

export class SettingsRepository {
  constructor(private readonly database: Database) {}

  async project(): Promise<ProjectSettings | undefined> {
    const result = await this.database.query<{
      project_id: string;
      name: string;
    }>(
      "SELECT p.project_id, p.name FROM active_project a JOIN projects p USING (project_id) WHERE a.singleton = true",
    );
    const row = result.rows[0];
    return row ? { id: row.project_id, name: row.name } : undefined;
  }

  async setProject(id: string, name: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      await connection.query(
        "INSERT INTO projects (project_id, name) VALUES ($1,$2) ON CONFLICT (project_id) DO UPDATE SET name=EXCLUDED.name",
        [id, name],
      );
      await connection.query(
        "INSERT INTO active_project (singleton, project_id) VALUES (true, $1) ON CONFLICT (singleton) DO NOTHING",
        [id],
      );
      const current = await connection.query<{ project_id: string }>(
        "SELECT project_id FROM active_project WHERE singleton = true FOR UPDATE",
      );
      if (current.rows[0] && current.rows[0].project_id !== id)
        throw new ApiError(409, "PROJECT_ID_LOCKED", "The active project ID cannot be changed");
    });
  }

  async collection(id: string): Promise<{ origins: string[] } | undefined> {
    const result = await this.database.query<{ origins: string[] }>(
      "SELECT origins FROM collections WHERE collection_id=$1",
      [id],
    );
    return result.rows[0];
  }

  async collections(): Promise<Array<{ collectionId: string; origins: string[] }>> {
    const result = await this.database.query<{
      collection_id: string;
      origins: string[];
    }>("SELECT collection_id, origins FROM collections ORDER BY collection_id");
    return result.rows.map((row) => ({
      collectionId: row.collection_id,
      origins: row.origins,
    }));
  }

  async setCollection(id: string, origins: string[]): Promise<void> {
    await this.database.query(
      "INSERT INTO collections (collection_id, origins) VALUES ($1,$2::jsonb) ON CONFLICT (collection_id) DO UPDATE SET origins=EXCLUDED.origins",
      [id, JSON.stringify(origins)],
    );
  }

  async deleteCollection(id: string): Promise<void> {
    await this.database.query("DELETE FROM collections WHERE collection_id=$1", [id]);
  }

  async hasToken(token: string): Promise<boolean> {
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await this.database.query("SELECT 1 FROM api_tokens WHERE token_hash=$1", [
      hash,
    ]);
    return result.rowCount !== 0;
  }

  async createToken(): Promise<{ tokenId: string; token: string }> {
    const tokenId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await this.database.query("INSERT INTO api_tokens (token_id, token_hash) VALUES ($1,$2)", [
      tokenId,
      hash,
    ]);
    return { tokenId, token };
  }

  async tokens(): Promise<Array<{ tokenId: string }>> {
    const result = await this.database.query<{ token_id: string }>(
      "SELECT token_id FROM api_tokens ORDER BY token_id",
    );
    return result.rows.map(({ token_id }) => ({ tokenId: token_id }));
  }

  async deleteToken(id: string): Promise<void> {
    await this.database.query("DELETE FROM api_tokens WHERE token_id=$1", [id]);
  }
}
