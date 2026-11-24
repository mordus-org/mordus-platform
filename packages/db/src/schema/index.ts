import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  projectId: text("project_id").primaryKey(),
  name: text("name").notNull(),
});

export const activeProject = pgTable(
  "active_project",
  {
    singleton: boolean("singleton").default(true).primaryKey(),
    projectId: text("project_id").notNull().unique("active_project_project_id_key"),
  },
  (table) => [
    check("active_project_singleton_check", sql`${table.singleton}`),
    foreignKey({
      name: "active_project_project_id_fkey",
      columns: [table.projectId],
      foreignColumns: [projects.projectId],
    }),
  ],
);

export const collections = pgTable("collections", {
  collectionId: text("collection_id").primaryKey(),
  origins: jsonb("origins").notNull().default([]),
});

export const apiTokens = pgTable("api_tokens", {
  tokenId: text("token_id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique("api_tokens_token_hash_key"),
});

export const users = pgTable(
  "users",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    userKey: text("user_key").notNull(),
  },
  (table) => [
    foreignKey({
      name: "users_project_id_fkey",
      columns: [table.projectId],
      foreignColumns: [projects.projectId],
    }),
    primaryKey({ name: "users_pkey", columns: [table.projectId, table.userId] }),
    unique("users_project_id_user_key_key").on(table.projectId, table.userKey),
  ],
);

export const events = pgTable(
  "events",
  {
    projectId: text("project_id").notNull(),
    eventId: text("event_id").notNull(),
    userId: text("user_id"),
    userKey: text("user_key"),
    sessionId: text("session_id").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    category: text("category").notNull(),
    type: text("type").notNull(),
    source: text("source").notNull(),
    page: jsonb("page").notNull(),
    eventPayload: jsonb("event_payload").notNull(),
  },
  (table) => [
    foreignKey({
      name: "events_project_id_fkey",
      columns: [table.projectId],
      foreignColumns: [projects.projectId],
    }),
    primaryKey({ name: "events_pkey", columns: [table.projectId, table.eventId] }),
    index("events_project_time_idx").on(table.projectId, table.eventTimestamp),
    index("events_project_user_time_idx").on(table.projectId, table.userKey, table.eventTimestamp),
    index("events_project_session_time_idx").on(
      table.projectId,
      table.userKey,
      table.sessionId,
      table.eventTimestamp,
    ),
  ],
);
