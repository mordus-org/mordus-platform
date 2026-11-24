import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { serverSchema } from "@mordus-platform/env/server-schema";
import { migrationsFolder } from "./migrations";
import { z } from "zod";
import type { Config } from "./config";
import type { Database, QueryExecutor } from "@mordus-platform/db/postgres";
import { readDatabaseMigrations, PostgresDatabase } from "@mordus-platform/db/postgres";

const event = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  eventId: "event_1",
  projectId: "project_a",
  sessionId: "session_1",
  userId: "customer_42",
  timestamp: "2025-01-10T12:00:00.000Z",
  source: "auto",
  category: "page",
  type: "page.view",
  page: { path: "/home", route: "/home" },
  ...overrides,
});

describe("tracking API with PostgreSQL", () => {
  let directory = "";
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: Database;
  let config: Config;
  let appClosed = false;
  let frontendToken = "";
  const adminHeaders = { authorization: "Bearer test_admin_secret" };

  async function createDatabase(): Promise<Database> {
    if (process.env.TEST_DATABASE_URL) {
      const schema = `mordus_test_${randomUUID().replaceAll("-", "")}`;
      const admin = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schema}`,
      });
      const database = new PostgresDatabase(pool);
      await database.migrate(migrationsFolder, schema);
      return {
        query: (sql, values) => database.query(sql, values),
        transaction: (operation) => database.transaction(operation),
        close: async () => {
          await database.close();
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
          await admin.end();
        },
      };
    }

    const postgres = new PGlite();
    await postgres.exec(readDatabaseMigrations(migrationsFolder).join("\n"));
    const query = async <Row extends QueryResultRow = QueryResultRow>(
      sql: string,
      values?: unknown[],
    ) => postgres.query<Row>(sql, values) as Promise<QueryResult<Row>>;
    return {
      query,
      transaction: <Result>(operation: (connection: QueryExecutor) => Promise<Result>) =>
        postgres.transaction(async (transaction) =>
          operation({
            query: async <Row extends QueryResultRow = QueryResultRow>(
              sql: string,
              values?: unknown[],
            ) => transaction.query<Row>(sql, values) as Promise<QueryResult<Row>>,
          }),
        ),
      close: () => postgres.close(),
    };
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mordus-platform-server-test-"));
    appClosed = false;

    database = await createDatabase();
    config = {
      host: "127.0.0.1",
      port: 0,
      databaseUrl: "postgres://unused",
      adminToken: "test_admin_secret",
      rateLimit: 100,
      logLevel: "error",
      logDir: join(directory, "logs"),
      corsOrigin: "https://web.example",
    };
    app = await buildApp(config, database);
    await app.inject({
      method: "PUT",
      url: "/v1/admin/project",
      headers: adminHeaders,
      payload: { projectId: "project_a", name: "Project A" },
    });
    await app.inject({
      method: "PUT",
      url: "/v1/admin/collections/public_collection",
      headers: adminHeaders,
      payload: { origins: ["https://app.example"] },
    });
    const issued = await app.inject({
      method: "POST",
      url: "/v1/admin/tokens",
      headers: adminHeaders,
      payload: {},
    });
    frontendToken = issued.json().data.token;
  });

  afterEach(async () => {
    if (!appClosed) await app.close();
    await database.close();

    await rm(directory, { recursive: true, force: true });
  });

  async function collect(batch: unknown[]) {
    return app.inject({
      method: "POST",
      url: "/v1/collect/public_collection",
      headers: {
        "content-type": "application/json",
        origin: "https://app.example",
      },
      payload: { events: batch },
    });
  }

  it("accepts and transactionally deduplicates events, then returns frontend metrics", async () => {
    expect((await collect([event()])).statusCode).toBe(204);
    expect((await collect([event()])).statusCode).toBe(204);

    const lookup = await app.inject({
      method: "POST",
      url: "/v1/projects/project_a/users/lookup",
      headers: { authorization: `Bearer ${frontendToken}` },
      payload: { userId: "customer_42" },
    });
    const { data: identity } = lookup.json();
    expect(lookup.statusCode).toBe(200);
    expect(identity.userKey).toMatch(/^usr_/);

    const period = "from=2025-01-01T00:00:00.000Z&to=2025-02-01T00:00:00.000Z";
    const summary = await app.inject({
      method: "GET",
      url: `/v1/projects/project_a/users/${identity.userKey}/summary?${period}`,
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(summary.json()).toMatchObject({
      data: { activeDays: 1, sessions: 1, pageViews: 1, actions: 0 },
      error: null,
    });
    const sessions = await app.inject({
      method: "GET",
      url: `/v1/projects/project_a/users/${identity.userKey}/sessions?${period}`,
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(sessions.json().data.items).toHaveLength(1);
    const timeline = await app.inject({
      method: "GET",
      url: `/v1/projects/project_a/users/${identity.userKey}/sessions/session_1/events?${period}`,
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(timeline.json().data.items).toMatchObject([{ eventId: "event_1", type: "page.view" }]);
  });

  it("rejects invalid batches without partially inserting any events", async () => {
    const response = await collect([event(), event({ type: "not_allowed" })]);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: null,
      error: { code: "INVALID_EVENT", requestId: expect.any(String) },
    });
    const count = await database.query("SELECT COUNT(*)::int AS count FROM events");
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it("enforces project access and the configured browser origin", async () => {
    const forbiddenOrigin = await app.inject({
      method: "POST",
      url: "/v1/collect/public_collection",
      headers: {
        "content-type": "application/json",
        origin: "https://other.example",
      },
      payload: { events: [event()] },
    });
    expect(forbiddenOrigin.statusCode).toBe(403);
    const accessDenied = await app.inject({
      method: "GET",
      url: "/v1/projects/project_b/users",
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(accessDenied.statusCode).toBe(403);
    expect(accessDenied.json()).toMatchObject({
      data: null,
      error: { code: "FORBIDDEN" },
    });
    const wrongProject = await app.inject({
      method: "POST",
      url: "/v1/collect/public_collection",
      headers: { origin: "https://app.example" },
      payload: { events: [{ ...event(), projectId: "project_b" }] },
    });
    expect(wrongProject.statusCode).toBe(400);
    expect(wrongProject.json()).toMatchObject({
      error: { code: "PROJECT_MISMATCH" },
    });
  });

  it("keeps root CORS separate from the collection preflight", async () => {
    const origin = "https://web.example";
    const root = await app.inject({ url: "/", headers: { origin } });
    expect(root.body).toBe("OK");
    expect(root.headers["access-control-allow-origin"]).toBe(origin);

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/collect/public_collection",
      headers: { origin: "https://app.example", "access-control-request-method": "POST" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://app.example");
  });

  it("reapplies the initial SQL without changing existing events or tokens", async () => {
    expect((await collect([event()])).statusCode).toBe(204);
    for (const statement of readDatabaseMigrations(migrationsFolder)) {
      await database.query(statement);
    }
    const events = await database.query("SELECT event_id FROM events");
    expect(events.rows).toEqual([{ event_id: "event_1" }]);
    const projects = await app.inject({
      url: "/v1/projects",
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(projects.statusCode).toBe(200);
  });

  it("uses the common response envelope for successful JSON routes", async () => {
    const projects = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(projects.json()).toEqual({
      data: { items: [{ projectId: "project_a", name: "Project A" }] },
      error: null,
    });
  });

  it("preserves the complete context identifier range used by the SDK", async () => {
    const valid = event({
      eventId: "a".repeat(128),
      sessionId: "s-01_02",
      userId: "user-01_02",
    });
    expect((await collect([valid])).statusCode).toBe(204);
    const invalid = event({ eventId: "invalid.id" });
    expect((await collect([invalid])).statusCode).toBe(400);
  });

  it("validates strict event schemas and query parameters", async () => {
    const extraEventField = await collect([event({ extra: true })]);
    expect(extraEventField.statusCode).toBe(400);
    expect(extraEventField.json().error.code).toBe("INVALID_EVENT");

    const badLimit = await app.inject({
      method: "GET",
      url: "/v1/projects/project_a/users?limit=101",
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(badLimit.statusCode).toBe(400);
    expect(badLimit.json().error.code).toBe("INVALID_PAGINATION");
  });

  it("protects admin settings, locks the project ID, and hides tokens", async () => {
    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/admin/project",
    });
    expect(unauthorized.statusCode).toBe(401);
    const secondProject = await app.inject({
      method: "PUT",
      url: "/v1/admin/project",
      headers: adminHeaders,
      payload: { projectId: "project_b", name: "Project B" },
    });
    expect(secondProject.statusCode).toBe(409);
    const listed = await app.inject({
      method: "GET",
      url: "/v1/admin/tokens",
      headers: adminHeaders,
    });
    expect(JSON.stringify(listed.json())).not.toContain(frontendToken);
    expect(listed.json().data).toHaveLength(1);
  });

  it("returns service unavailable before project and collection setup", async () => {
    const emptyDatabase = await createDatabase();
    const emptyApp = await buildApp(config, emptyDatabase);
    try {
      await emptyApp.inject({
        method: "PUT",
        url: "/v1/admin/collections/not-configured",
        headers: adminHeaders,
        payload: { origins: [] },
      });
      const issued = await emptyApp.inject({
        method: "POST",
        url: "/v1/admin/tokens",
        headers: adminHeaders,
        payload: {},
      });
      const collection = await emptyApp.inject({
        method: "POST",
        url: "/v1/collect/not-configured",
        payload: { events: [event()] },
      });
      expect(collection.statusCode).toBe(503);
      const query = await emptyApp.inject({
        method: "GET",
        url: "/v1/projects/project_a/users",
        headers: { authorization: `Bearer ${issued.json().data.token}` },
      });
      expect(query.statusCode).toBe(503);
      await emptyDatabase.query(
        "INSERT INTO projects (project_id, name) VALUES ('project_a', 'Legacy project'), ('project_b', 'Other project')",
      );
      await emptyDatabase.query(
        "INSERT INTO users (project_id, user_id, user_key) VALUES ('project_a', 'legacy-user', 'usr_legacy')",
      );
      const configured = await emptyApp.inject({
        method: "PUT",
        url: "/v1/admin/project",
        headers: adminHeaders,
        payload: { projectId: "project_a", name: "Active project" },
      });
      expect(configured.statusCode).toBe(200);
      const lookup = await emptyApp.inject({
        method: "POST",
        url: "/v1/projects/project_a/users/lookup",
        headers: { authorization: `Bearer ${issued.json().data.token}` },
        payload: { userId: "legacy-user" },
      });
      expect(lookup.statusCode).toBe(200);
      expect(lookup.json().data).toEqual({ userKey: "usr_legacy" });
    } finally {
      await emptyApp.close();
      await emptyDatabase.close();
    }
  });

  it("applies collection origin edits immediately", async () => {
    const update = await app.inject({
      method: "PUT",
      url: "/v1/admin/collections/public_collection",
      headers: adminHeaders,
      payload: { origins: ["https://new.example"] },
    });
    expect(update.statusCode).toBe(200);
    const oldOrigin = await app.inject({
      method: "POST",
      url: "/v1/collect/public_collection",
      headers: { origin: "https://app.example" },
      payload: { events: [event()] },
    });
    expect(oldOrigin.statusCode).toBe(403);
    const newOrigin = await app.inject({
      method: "POST",
      url: "/v1/collect/public_collection",
      headers: { origin: "https://new.example" },
      payload: { events: [event()] },
    });
    expect(newOrigin.statusCode).toBe(204);
  });

  it("allows only one project under concurrent first setup", async () => {
    const emptyDatabase = await createDatabase();
    const emptyApp = await buildApp(config, emptyDatabase);
    try {
      const create = (projectId: string) =>
        emptyApp.inject({
          method: "PUT",
          url: "/v1/admin/project",
          headers: adminHeaders,
          payload: { projectId, name: projectId },
        });
      const responses = await Promise.all([create("first"), create("second")]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    } finally {
      await emptyApp.close();
      await emptyDatabase.close();
    }
  });

  it("revokes query tokens immediately", async () => {
    const listing = await app.inject({
      method: "GET",
      url: "/v1/admin/tokens",
      headers: adminHeaders,
    });
    const tokenId = listing.json().data[0].tokenId;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/admin/tokens/${tokenId}`,
      headers: adminHeaders,
    });
    expect(deleted.statusCode).toBe(200);
    const projects = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${frontendToken}` },
    });
    expect(projects.statusCode).toBe(401);
  });

  it("validates environment values with the config schema", () => {
    expect(
      z.object(serverSchema).safeParse({
        DATABASE_URL: "postgres://localhost/db",
        CORS_ORIGIN: "https://web.example",
        PORT: "not-a-port",
      }).error?.issues,
    ).toEqual([expect.objectContaining({ path: ["PORT"] })]);
  });

  it("writes structured error records to the combined and error files", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/project_a/users",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
    appClosed = true;

    const combined = await readFile(join(directory, "logs", "combined.log"), "utf8");
    const errors = await readFile(join(directory, "logs", "errors.log"), "utf8");
    expect(JSON.parse(combined.trim().split("\n").at(-1) ?? "{}")).toMatchObject({
      level: 50,
      service: "mordus-platform-server",
      msg: "Request failed",
      errorCode: "UNAUTHORIZED",
    });
    expect(JSON.parse(errors.trim().split("\n").at(-1) ?? "{}")).toMatchObject({
      level: 50,
      service: "mordus-platform-server",
      errorCode: "UNAUTHORIZED",
    });
  });
});
