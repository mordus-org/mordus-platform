CREATE TABLE IF NOT EXISTS projects (
  project_id text PRIMARY KEY,
  name text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS active_project (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_id text NOT NULL UNIQUE REFERENCES projects(project_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS collections (
  collection_id text PRIMARY KEY,
  origins jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS api_tokens (
  token_id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS users (
  project_id text NOT NULL REFERENCES projects(project_id),
  user_id text NOT NULL,
  user_key text NOT NULL,
  PRIMARY KEY (project_id, user_id),
  UNIQUE (project_id, user_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS events (
  project_id text NOT NULL REFERENCES projects(project_id),
  event_id text NOT NULL,
  user_id text,
  user_key text,
  session_id text NOT NULL,
  event_timestamp timestamptz NOT NULL,
  category text NOT NULL,
  type text NOT NULL,
  source text NOT NULL,
  page jsonb NOT NULL,
  event_payload jsonb NOT NULL,
  PRIMARY KEY (project_id, event_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_project_time_idx ON events(project_id, event_timestamp);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_project_user_time_idx ON events(project_id, user_key, event_timestamp);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_project_session_time_idx ON events(project_id, user_key, session_id, event_timestamp);
