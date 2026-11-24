import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface Database extends QueryExecutor {
  transaction<T>(operation: (connection: QueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function readDatabaseMigrations(migrationsFolder: string): string[] {
  return readMigrationFiles({ migrationsFolder }).flatMap((migration) => migration.sql);
}

export class PostgresDatabase implements Database {
  constructor(private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    return this.pool.query<T>(sql, values);
  }

  async transaction<T>(operation: (connection: QueryExecutor) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(migrationsFolder: string, migrationsSchema = "drizzle"): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", ["mordus-platform-migrations"]);
      await migrate(drizzle(client), { migrationsFolder, migrationsSchema });
    } finally {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", ["mordus-platform-migrations"])
        .catch(() => undefined);
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export async function createPostgresDatabase(
  connectionString: string,
  migrationsFolder: string,
): Promise<PostgresDatabase> {
  const database = new PostgresDatabase(new Pool({ connectionString }));
  try {
    await database.migrate(migrationsFolder);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}
