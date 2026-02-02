// Database connection singleton for serverless environments
//
// In serverless (Vercel, Netlify, etc.), each function invocation might
// create a new database connection. This singleton ensures we reuse
// connections across warm invocations while properly initializing on cold starts.

import {
  postgres,
  type TransactionalRepositoryContext,
} from '@omnilith/repositories';

type Database = ReturnType<typeof postgres.createDatabase>['db'];
type Client = ReturnType<typeof postgres.createDatabase>['client'];

let dbInstance: Database | null = null;
let clientInstance: Client | null = null;

/**
 * Get the database connection singleton.
 *
 * Creates a new connection on first call, reuses on subsequent calls.
 * This pattern is safe for serverless environments where module-level
 * variables persist across warm invocations.
 *
 * @throws Error if DATABASE_URL is not set
 */
export function getDb(): Database {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const { db, client } = postgres.createDatabase({
      connectionString,
      // Limit connections for serverless - each instance should use few connections
      maxConnections: 3,
    });

    dbInstance = db;
    clientInstance = client;
  }

  return dbInstance;
}

/**
 * Close the database connection.
 *
 * Call this during graceful shutdown if needed.
 * In serverless environments, this is typically not called
 * as the runtime handles connection cleanup.
 */
export async function closeDb(): Promise<void> {
  if (clientInstance) {
    await clientInstance.end();
    dbInstance = null;
    clientInstance = null;
  }
}

/**
 * Get a TransactionalRepositoryContext backed by the database singleton.
 *
 * This is the primary way to access repositories in the API layer.
 */
export function getRepositoryContext(): TransactionalRepositoryContext {
  return postgres.createTransactionalPgRepositoryContext(getDb());
}

export type { Database, TransactionalRepositoryContext };
