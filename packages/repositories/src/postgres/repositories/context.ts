import type { Database } from '../db.js';
import type {
  RepositoryContext,
  TransactionalRepositoryContext,
  TransactionFn,
} from '../../interfaces/index.js';
import { PgNodeRepository } from './node-repository.js';
import { PgObservationRepository } from './observation-repository.js';
import { PgArtifactRepository } from './artifact-repository.js';
import { PgVariableRepository } from './variable-repository.js';
import { PgEpisodeRepository } from './episode-repository.js';
import { PgPolicyRepository } from './policy-repository.js';
import { PgActionRunRepository } from './action-run-repository.js';
import { PgSurfaceRepository } from './surface-repository.js';
import { PgEntityRepository } from './entity-repository.js';
import { PgGrantRepository } from './grant-repository.js';

/**
 * Create a RepositoryContext backed by Postgres.
 *
 * Usage:
 * ```ts
 * const { db } = createDatabase({ connectionString: process.env.DATABASE_URL });
 * const repos = createPgRepositoryContext(db);
 *
 * // Now use repos.nodes, repos.observations, etc.
 * const node = await repos.nodes.create({ ... });
 * ```
 */
export function createPgRepositoryContext(db: Database): RepositoryContext {
  return {
    nodes: new PgNodeRepository(db),
    observations: new PgObservationRepository(db),
    artifacts: new PgArtifactRepository(db),
    variables: new PgVariableRepository(db),
    episodes: new PgEpisodeRepository(db),
    policies: new PgPolicyRepository(db),
    actionRuns: new PgActionRunRepository(db),
    surfaces: new PgSurfaceRepository(db),
    entities: new PgEntityRepository(db),
    grants: new PgGrantRepository(db),
  };
}

/**
 * Create a TransactionalRepositoryContext backed by Postgres.
 *
 * This extends the basic RepositoryContext with transaction support,
 * allowing multiple operations to be executed atomically.
 *
 * Usage:
 * ```ts
 * const { db } = createDatabase({ connectionString: process.env.DATABASE_URL });
 * const repos = createTransactionalPgRepositoryContext(db);
 *
 * // Execute multiple operations atomically
 * const result = await repos.transaction(async (txRepos) => {
 *   const artifact = await txRepos.artifacts.create({ ... });
 *   await txRepos.entities.appendEvent(entityId, { ... });
 *   return artifact;
 * });
 * ```
 */
export function createTransactionalPgRepositoryContext(
  db: Database
): TransactionalRepositoryContext {
  return new TransactionalPgRepositoryContext(db);
}

/**
 * TransactionalRepositoryContext implementation for Postgres.
 *
 * Provides all repository interfaces plus a transaction() method
 * for executing atomic operations.
 */
class TransactionalPgRepositoryContext implements TransactionalRepositoryContext {
  readonly nodes: PgNodeRepository;
  readonly observations: PgObservationRepository;
  readonly artifacts: PgArtifactRepository;
  readonly variables: PgVariableRepository;
  readonly episodes: PgEpisodeRepository;
  readonly policies: PgPolicyRepository;
  readonly actionRuns: PgActionRunRepository;
  readonly surfaces: PgSurfaceRepository;
  readonly entities: PgEntityRepository;
  readonly grants: PgGrantRepository;

  constructor(private db: Database) {
    this.nodes = new PgNodeRepository(db);
    this.observations = new PgObservationRepository(db);
    this.artifacts = new PgArtifactRepository(db);
    this.variables = new PgVariableRepository(db);
    this.episodes = new PgEpisodeRepository(db);
    this.policies = new PgPolicyRepository(db);
    this.actionRuns = new PgActionRunRepository(db);
    this.surfaces = new PgSurfaceRepository(db);
    this.entities = new PgEntityRepository(db);
    this.grants = new PgGrantRepository(db);
  }

  /**
   * Execute a function within a database transaction.
   *
   * All repository operations within the function will be atomic:
   * - If the function returns successfully, all changes are committed
   * - If the function throws, all changes are rolled back
   *
   * @param fn Function to execute within the transaction
   * @returns The return value of the function
   * @throws Rolls back the transaction and rethrows if the function throws
   *
   * @example
   * ```ts
   * const result = await repos.transaction(async (txRepos) => {
   *   // Create artifact and entity event atomically
   *   const artifact = await txRepos.artifacts.create({
   *     nodeId: 'node-1',
   *     title: 'My Document',
   *     about: '...',
   *     page: { version: 1, blocks: [] },
   *   }, { authorId: 'author-1' });
   *
   *   await txRepos.entities.appendEvent(entityId, {
   *     type: 'linked_to_artifact',
   *     data: { artifactId: artifact.id },
   *     actorNodeId: 'author-1',
   *   });
   *
   *   return artifact;
   * });
   * ```
   */
  async transaction<T>(fn: TransactionFn<T>): Promise<T> {
    // Use Drizzle's transaction method
    // The transaction callback receives a transaction-scoped database (tx)
    // that we use to create new repositories for the transaction
    return this.db.transaction(async (tx) => {
      // Create a new repository context using the transaction connection
      // Cast tx to Database since Drizzle's transaction type is compatible
      const txDb = tx as unknown as Database;
      const txRepos: RepositoryContext = {
        nodes: new PgNodeRepository(txDb),
        observations: new PgObservationRepository(txDb),
        artifacts: new PgArtifactRepository(txDb),
        variables: new PgVariableRepository(txDb),
        episodes: new PgEpisodeRepository(txDb),
        policies: new PgPolicyRepository(txDb),
        actionRuns: new PgActionRunRepository(txDb),
        surfaces: new PgSurfaceRepository(txDb),
        entities: new PgEntityRepository(txDb),
        grants: new PgGrantRepository(txDb),
      };

      // Execute the function with the transaction-scoped repositories
      return fn(txRepos);
    });
  }
}
