// Repository interfaces
// These define the contracts for data access, enabling substrate independence.

export type {
  NodeRepository,
  CreateNodeInput,
  UpdateNodeInput,
  CreateEdgeInput,
  NodeFilter,
} from './node-repository.js';

export type {
  ObservationRepository,
  AppendObservationInput,
} from './observation-repository.js';

export type {
  ArtifactRepository,
  CreateArtifactInput,
  UpdateArtifactInput,
  CreateRevisionInput,
  ArtifactFilter,
} from './artifact-repository.js';

export type {
  VariableRepository,
  CreateVariableInput,
  UpdateVariableInput,
  VariableFilter,
} from './variable-repository.js';

export type {
  EpisodeRepository,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  EpisodeFilter,
} from './episode-repository.js';

export type {
  PolicyRepository,
  CreatePolicyInput,
  UpdatePolicyInput,
  PolicyFilter,
} from './policy-repository.js';

export type {
  ActionRunRepository,
  CreateActionRunInput,
  ActionRunFilter,
} from './action-run-repository.js';

export type {
  SurfaceRepository,
  CreateSurfaceInput,
  UpdateSurfaceInput,
  CreateLayoutInput,
  UpdateLayoutInput,
  SurfaceFilter,
} from './surface-repository.js';

export type {
  EntityRepository,
  CreateEntityTypeInput,
  CreateEntityInput,
  AppendEntityEventInput,
  EntityFilter,
  EntityEventFilter,
} from './entity-repository.js';

export type {
  GrantRepository,
  CreateGrantInput,
  GrantFilter,
} from './grant-repository.js';

export type {
  RepositoryContext,
  RepositoryContextFactory,
  TransactionFn,
  TransactionalRepositoryContext,
} from './repository-context.js';
