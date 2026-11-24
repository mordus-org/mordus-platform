export type Category = "element" | "field" | "form" | "page" | "custom" | "error";

export interface MonitorEvent {
  schemaVersion: 1;
  eventId: string;
  projectId: string;
  sessionId: string;
  userId?: string;
  timestamp: string;
  source: "manual" | "auto";
  category: Category;
  type: string;
  page: {
    path: string;
    route?: string;
    previousPath?: string;
    navigationType?: string;
  };
  element?: { identifier: string; path?: string[]; tagName?: string };
  metadata?: Record<string, unknown>;
}

export interface StoredEvent {
  event: MonitorEvent;
  userKey: string | null;
}

export interface DatabaseState {
  projects: Record<string, string>;
  users: Record<string, Record<string, string>>;
  events: StoredEvent[];
}
