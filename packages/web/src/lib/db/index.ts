// Database connection singleton for serverless environments
//
// Supports two modes:
// - In-memory (default in development): Fast, no setup required
// - Postgres: Set DATABASE_URL environment variable
//
// Usage:
//   npm run dev              -> Uses in-memory with seed data
//   DATABASE_URL=... npm run dev -> Uses Postgres

import {
  postgres,
  memory,
  type TransactionalRepositoryContext,
} from '@omnilith/repositories';
import { seedDemoData } from './seed';

type Database = ReturnType<typeof postgres.createDatabase>['db'];
type Client = ReturnType<typeof postgres.createDatabase>['client'];

// Singletons
let dbInstance: Database | null = null;
let clientInstance: Client | null = null;
let memoryRepos: memory.InMemoryRepositoryContext | null = null;
let seeded = false;

/**
 * Check if we should use in-memory storage.
 * Uses in-memory if DATABASE_URL is not set.
 */
export function useInMemory(): boolean {
  return !process.env.DATABASE_URL;
}

/**
 * Get the database connection singleton (Postgres mode only).
 *
 * @throws Error if DATABASE_URL is not set
 */
export function getDb(): Database {
  if (useInMemory()) {
    throw new Error('getDb() called but using in-memory storage. Use getRepositoryContext() instead.');
  }

  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const { db, client } = postgres.createDatabase({
      connectionString,
      maxConnections: 3,
    });

    dbInstance = db;
    clientInstance = client;
  }

  return dbInstance;
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (clientInstance) {
    await clientInstance.end();
    dbInstance = null;
    clientInstance = null;
  }
  if (memoryRepos) {
    memoryRepos = null;
    seeded = false;
  }
}

/**
 * Get the in-memory repository context.
 * Automatically seeds with demo data on first access.
 */
async function getInMemoryRepositoryContext(): Promise<memory.InMemoryRepositoryContext> {
  if (!memoryRepos) {
    memoryRepos = memory.createInMemoryRepositoryContext();

    // Seed with demo data (only once)
    if (!seeded) {
      await seedDemoData(memoryRepos);
      seeded = true;
      console.log('Using in-memory storage with seed data');
    }
  }

  return memoryRepos;
}

/**
 * Get a TransactionalRepositoryContext.
 *
 * This is the primary way to access repositories in the API layer.
 * Automatically chooses between in-memory and Postgres based on DATABASE_URL.
 */
export function getRepositoryContext(): TransactionalRepositoryContext {
  if (useInMemory()) {
    // For in-memory, we need to handle this synchronously for the tRPC context
    // The seeding happens asynchronously but the repos are available immediately
    if (!memoryRepos) {
      memoryRepos = memory.createInMemoryRepositoryContext();

      // Seed asynchronously - first request might not have data
      // but subsequent requests will
      if (!seeded) {
        seeded = true; // Mark as seeding to prevent double-seeding
        seedDemoData(memoryRepos)
          .then(() => console.log('In-memory storage seeded with demo data'))
          .catch((err) => console.error('Failed to seed demo data:', err));
      }
    }
    return memoryRepos;
  }

  return postgres.createTransactionalPgRepositoryContext(getDb());
}

/**
 * Get a TransactionalRepositoryContext (async version).
 *
 * Ensures seed data is loaded before returning.
 * Use this when you need guaranteed seeded data.
 */
export async function getRepositoryContextAsync(): Promise<TransactionalRepositoryContext> {
  if (useInMemory()) {
    return getInMemoryRepositoryContext();
  }

  return postgres.createTransactionalPgRepositoryContext(getDb());
}

/**
 * Clear all in-memory data (useful for testing).
 */
export function clearInMemoryData(): void {
  if (memoryRepos) {
    memoryRepos.clear();
    seeded = false;
  }
}

/**
 * Re-seed the in-memory database.
 */
export async function reseedInMemoryData(): Promise<void> {
  if (memoryRepos) {
    memoryRepos.clear();
    seeded = false;
    await seedDemoData(memoryRepos);
    seeded = true;
  }
}

export type { Database, TransactionalRepositoryContext };
