import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type DatabaseConfig = {
  connectionString: string;
  maxConnections?: number;
};

/**
 * Create a database connection and Drizzle instance.
 *
 * Usage:
 * ```ts
 * const { db, client } = createDatabase({
 *   connectionString: process.env.DATABASE_URL
 * });
 * ```
 */
export function createDatabase(config: DatabaseConfig) {
  const client = postgres(config.connectionString, {
    max: config.maxConnections ?? 10,
  });

  const db = drizzle(client, { schema });

  return { db, client };
}

export type Database = ReturnType<typeof createDatabase>['db'];
