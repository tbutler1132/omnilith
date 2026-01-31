import type { Database } from '../db.js';
import type { RepositoryContext } from '../../interfaces/index.js';
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
