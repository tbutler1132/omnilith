import type { NodeRepository } from './node-repository.js';
import type { ObservationRepository } from './observation-repository.js';
import type { ArtifactRepository } from './artifact-repository.js';
import type { VariableRepository } from './variable-repository.js';
import type { EpisodeRepository } from './episode-repository.js';
import type { PolicyRepository } from './policy-repository.js';
import type { ActionRunRepository } from './action-run-repository.js';
import type { SurfaceRepository } from './surface-repository.js';
import type { EntityRepository } from './entity-repository.js';
import type { GrantRepository } from './grant-repository.js';

/**
 * RepositoryContext bundles all repository interfaces together.
 *
 * This is the primary dependency injection point for the runtime.
 * Pass a RepositoryContext to any code that needs data access,
 * and you can swap implementations (Postgres, SQLite, in-memory, etc.)
 * without changing the consuming code.
 *
 * Example usage:
 * ```typescript
 * const repos = createPostgresRepositoryContext(db);
 * await processObservation(repos, observation);
 * ```
 */
export interface RepositoryContext {
  readonly nodes: NodeRepository;
  readonly observations: ObservationRepository;
  readonly artifacts: ArtifactRepository;
  readonly variables: VariableRepository;
  readonly episodes: EpisodeRepository;
  readonly policies: PolicyRepository;
  readonly actionRuns: ActionRunRepository;
  readonly surfaces: SurfaceRepository;
  readonly entities: EntityRepository;
  readonly grants: GrantRepository;
}

/**
 * Factory type for creating a RepositoryContext.
 * Implementations can use this to provide their own initialization logic.
 */
export type RepositoryContextFactory<TConfig = unknown> = (
  config: TConfig
) => RepositoryContext | Promise<RepositoryContext>;

/**
 * Transaction wrapper type for atomic operations across repositories.
 * Implementations should provide a way to run multiple operations in a transaction.
 */
export type TransactionFn<T> = (
  repos: RepositoryContext
) => Promise<T>;

/**
 * Extended context with transaction support.
 * Implementations that support transactions should implement this interface.
 */
export interface TransactionalRepositoryContext extends RepositoryContext {
  /**
   * Execute a function within a database transaction.
   * All repository operations within the function will be atomic.
   *
   * @param fn Function to execute within the transaction
   * @returns The return value of the function
   * @throws Rolls back the transaction if the function throws
   */
  transaction<T>(fn: TransactionFn<T>): Promise<T>;
}
