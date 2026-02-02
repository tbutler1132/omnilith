// PolicyContext builder - assembles read-only context for policy evaluation
//
// Phase 10.2: All canon accessors return frozen/immutable objects.
// Policies cannot mutate state through the context.

import type {
  Id,
  Observation,
  Policy,
  PolicyContext,
  CanonAccessor,
  EstimatesAccessor,
  Effect,
  VariableEstimate,
  ObservationFilter,
  Artifact,
  Entity,
  Variable,
  Episode,
} from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { deriveEstimate } from '../variables/estimate.js';

/**
 * Options for building a PolicyContext
 */
export type BuildPolicyContextOptions = {
  /**
   * Effects from higher-priority policies in this evaluation cycle
   */
  priorEffects?: Effect[];

  /**
   * Override the evaluation timestamp (defaults to now)
   */
  evaluatedAt?: string;

  /**
   * IDs of artifacts to pre-fetch for this evaluation.
   * If not provided, artifacts will be fetched lazily.
   */
  prefetchArtifactIds?: Id[];

  /**
   * IDs of entities to pre-fetch for this evaluation.
   * If not provided, entities will be fetched lazily.
   */
  prefetchEntityIds?: Id[];
};

/**
 * Default observation query limit per spec (§0.6)
 */
const DEFAULT_OBSERVATION_LIMIT = 100;

/**
 * Maximum observation query limit per spec (§0.6)
 */
const MAX_OBSERVATION_LIMIT = 1000;

/**
 * Default time window in hours for observation queries (§0.6)
 */
const DEFAULT_WINDOW_HOURS = 24;

/**
 * Pre-fetched data for the canon accessor.
 * This allows policies to access canon state synchronously.
 */
export type CanonAccessorData = {
  artifacts: Map<Id, Artifact>;
  entities: Map<Id, Entity>;
  variables: Map<Id, Variable>;
  activeEpisodes: Episode[];
  observations: Observation[];
};

/**
 * Deep freeze an object to make it immutable.
 * This ensures policies cannot mutate canon state.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Already frozen
  if (Object.isFrozen(obj)) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach((item) => deepFreeze(item));
    return Object.freeze(obj) as T;
  }

  // Handle objects
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}

/**
 * Creates a CanonAccessor that provides read-only access to pre-fetched canon state.
 *
 * The accessor enforces:
 * - I/O constraints from §0.6 (observation query limits)
 * - Immutability: all returned objects are frozen
 *
 * @param data - Pre-fetched data for the accessor
 * @param queryFn - Function to query observations
 * @param lazyFetchers - Optional async fetchers for lazy loading
 */
export function createCanonAccessor(
  data: CanonAccessorData,
  queryFn: (filter: ObservationFilter) => Observation[],
  lazyFetchers?: {
    fetchArtifact?: (id: Id) => Promise<Artifact | null>;
    fetchEntity?: (id: Id) => Promise<Entity | null>;
  }
): CanonAccessor {
  // Freeze all pre-fetched data
  const frozenArtifacts = new Map<Id, Artifact>();
  for (const [id, artifact] of data.artifacts) {
    frozenArtifacts.set(id, deepFreeze(artifact));
  }

  const frozenEntities = new Map<Id, Entity>();
  for (const [id, entity] of data.entities) {
    frozenEntities.set(id, deepFreeze(entity));
  }

  const frozenVariables = new Map<Id, Variable>();
  for (const [id, variable] of data.variables) {
    frozenVariables.set(id, deepFreeze(variable));
  }

  const frozenEpisodes = deepFreeze([...data.activeEpisodes]);

  return {
    getArtifact: (id: Id): Artifact | null => {
      // Check pre-fetched data first
      const prefetched = frozenArtifacts.get(id);
      if (prefetched) {
        return prefetched;
      }

      // If lazy fetcher is available, return null and log warning
      // In policy evaluation, we don't want to block on async operations
      // The design expects artifacts to be pre-fetched
      if (lazyFetchers?.fetchArtifact) {
        // Could log a warning here that artifact wasn't pre-fetched
        // For now, return null - policy should handle missing artifacts
      }

      return null;
    },

    getEntity: (id: Id): Entity | null => {
      // Check pre-fetched data first
      const prefetched = frozenEntities.get(id);
      if (prefetched) {
        return prefetched;
      }

      // Same logic as getArtifact
      if (lazyFetchers?.fetchEntity) {
        // Could log a warning here
      }

      return null;
    },

    getVariable: (id: Id): Variable | null => {
      return frozenVariables.get(id) ?? null;
    },

    getActiveEpisodes: (): Episode[] => {
      return frozenEpisodes;
    },

    queryObservations: (filter: ObservationFilter): Observation[] => {
      // Enforce limit constraints per §0.6
      const limit = Math.min(
        filter.limit ?? DEFAULT_OBSERVATION_LIMIT,
        MAX_OBSERVATION_LIMIT
      );

      // Apply default time window if no window/timeRange specified
      const hasWindow = filter.window !== undefined && filter.window !== null;
      const hasTimeRange = filter.timeRange !== undefined && filter.timeRange !== null;

      const effectiveFilter: ObservationFilter = {
        ...filter,
        limit,
        // Only add default window if neither window nor timeRange is specified
        ...(!hasWindow && !hasTimeRange ? { window: { hours: DEFAULT_WINDOW_HOURS } } : {}),
      };

      // Query from the pre-fetched observations when possible
      // This provides synchronous access to observations
      const result = queryFn(effectiveFilter);

      // Freeze the result
      return deepFreeze(result);
    },
  };
}

/**
 * Data needed to compute estimates.
 * Pre-fetched to allow synchronous access during policy evaluation.
 */
export type EstimatesAccessorData = {
  variables: Map<Id, Variable>;
  observations: Observation[];
  referenceTime: Date;
};

/**
 * Creates an EstimatesAccessor for derived variable estimates.
 *
 * Implements Phase 4.4: estimates are computed lazily on first access
 * using pre-fetched variables and observations.
 *
 * All returned estimates are frozen for immutability.
 *
 * @param data - Pre-fetched variables and observations for the node
 * @returns EstimatesAccessor that computes estimates on demand
 */
export function createEstimatesAccessor(
  data: EstimatesAccessorData
): EstimatesAccessor {
  // Cache for estimates computed within this evaluation cycle
  const estimateCache = new Map<Id, VariableEstimate | null>();

  return {
    getVariableEstimate: (variableId: Id): VariableEstimate | null => {
      // Check cache first
      if (estimateCache.has(variableId)) {
        return estimateCache.get(variableId)!;
      }

      // Get the variable
      const variable = data.variables.get(variableId);
      if (!variable) {
        estimateCache.set(variableId, null);
        return null;
      }

      // Derive the estimate
      const estimate = deriveEstimate(variable, data.observations, {
        referenceTime: data.referenceTime,
      });

      // Freeze the estimate for immutability
      const frozenEstimate = estimate ? deepFreeze(estimate) : null;

      // Cache and return
      estimateCache.set(variableId, frozenEstimate);
      return frozenEstimate;
    },
  };
}

/**
 * Legacy signature for backward compatibility.
 * Creates an EstimatesAccessor that returns null (no pre-fetched data).
 *
 * @deprecated Use createEstimatesAccessor(data: EstimatesAccessorData) instead
 */
export function createEmptyEstimatesAccessor(): EstimatesAccessor {
  return {
    getVariableEstimate: (): VariableEstimate | null => null,
  };
}

/**
 * Observation query function type for the canon accessor.
 * This allows different backends (sync cache, async repo wrapper) to provide
 * observation querying capability.
 */
export type ObservationQueryFn = (filter: ObservationFilter) => Observation[];

/**
 * Build a PolicyContext for evaluating a policy against an observation.
 *
 * The context provides:
 * - The triggering observation (frozen)
 * - Node metadata (id, kind, edges, grants) (frozen)
 * - Prior effects from higher-priority policies (frozen)
 * - Read-only canon access with I/O limits (all results frozen)
 * - Access to derived variable estimates (frozen)
 *
 * Phase 10.2: All data returned from the context is frozen/immutable.
 * Policies cannot mutate state through the context.
 *
 * @param repos - Repository context for data access
 * @param observation - The observation that triggered evaluation
 * @param policy - The policy being evaluated
 * @param options - Optional configuration
 * @returns A complete PolicyContext for the policy evaluator
 */
export async function buildPolicyContext(
  repos: RepositoryContext,
  observation: Observation,
  policy: Policy,
  options: BuildPolicyContextOptions = {}
): Promise<PolicyContext> {
  const {
    priorEffects = [],
    evaluatedAt,
    prefetchArtifactIds = [],
    prefetchEntityIds = [],
  } = options;

  // Load the node with its edges and grants
  const node = await repos.nodes.get(observation.nodeId);
  if (!node) {
    throw new Error(`Node not found: ${observation.nodeId}`);
  }

  const edges = await repos.nodes.getEdges(observation.nodeId);
  const grants = await repos.grants.getForGrantee(observation.nodeId);

  // Pre-fetch active episodes
  const activeEpisodes = await repos.episodes.getActive(observation.nodeId);

  // Pre-fetch variables for the node (Phase 4.4)
  const variablesList = await repos.variables.getByNode(observation.nodeId);
  const variablesMap = new Map<Id, Variable>();
  for (const v of variablesList) {
    variablesMap.set(v.id, v);
  }

  // Pre-fetch recent observations for estimate computation (Phase 4.4)
  // We fetch observations from the last 7 days to support trend calculations
  const recentObservations = await repos.observations.query({
    nodeId: observation.nodeId,
    window: { hours: 24 * 7 }, // 7 days for trend support
    limit: MAX_OBSERVATION_LIMIT,
  });

  // Pre-fetch artifacts (Phase 10.2)
  const artifactsMap = new Map<Id, Artifact>();
  if (prefetchArtifactIds.length > 0) {
    const artifactPromises = prefetchArtifactIds.map((id) => repos.artifacts.get(id));
    const artifacts = await Promise.all(artifactPromises);
    for (let i = 0; i < prefetchArtifactIds.length; i++) {
      const artifact = artifacts[i];
      if (artifact) {
        artifactsMap.set(prefetchArtifactIds[i], artifact);
      }
    }
  }

  // Pre-fetch entities (Phase 10.2)
  const entitiesMap = new Map<Id, Entity>();
  if (prefetchEntityIds.length > 0) {
    const entityPromises = prefetchEntityIds.map((id) => repos.entities.get(id));
    const entities = await Promise.all(entityPromises);
    for (let i = 0; i < prefetchEntityIds.length; i++) {
      const entity = entities[i];
      if (entity) {
        entitiesMap.set(prefetchEntityIds[i], entity);
      }
    }
  }

  // Create canon accessor data
  const canonData: CanonAccessorData = {
    artifacts: artifactsMap,
    entities: entitiesMap,
    variables: variablesMap,
    activeEpisodes,
    observations: recentObservations,
  };

  // Create synchronous observation query function
  // This filters from the pre-fetched observations for most queries
  const queryFn: ObservationQueryFn = (filter: ObservationFilter): Observation[] => {
    let result = [...recentObservations];

    // Apply filters
    if (filter.type) {
      result = result.filter((obs) => obs.type === filter.type);
    }

    if (filter.typePrefix) {
      result = result.filter((obs) => obs.type.startsWith(filter.typePrefix!));
    }

    if (filter.window?.hours) {
      const cutoff = new Date(Date.now() - filter.window.hours * 60 * 60 * 1000);
      result = result.filter((obs) => new Date(obs.timestamp) >= cutoff);
    }

    if (filter.timeRange?.start) {
      const start = new Date(filter.timeRange.start);
      result = result.filter((obs) => new Date(obs.timestamp) >= start);
    }

    if (filter.timeRange?.end) {
      const end = new Date(filter.timeRange.end);
      result = result.filter((obs) => new Date(obs.timestamp) <= end);
    }

    // Sort by timestamp descending (most recent first)
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    const limit = Math.min(filter.limit ?? DEFAULT_OBSERVATION_LIMIT, MAX_OBSERVATION_LIMIT);
    if (filter.offset) {
      result = result.slice(filter.offset);
    }
    result = result.slice(0, limit);

    return result;
  };

  // Build accessors with frozen data
  const canon = createCanonAccessor(canonData, queryFn, {
    // Lazy fetchers for artifacts/entities not pre-fetched
    fetchArtifact: (id) => repos.artifacts.get(id),
    fetchEntity: (id) => repos.entities.get(id),
  });

  // Build estimates accessor with pre-fetched data (Phase 4.4)
  const referenceTime = evaluatedAt ? new Date(evaluatedAt) : new Date();
  const estimates = createEstimatesAccessor({
    variables: variablesMap,
    observations: recentObservations,
    referenceTime,
  });

  // Freeze the observation and node data
  const frozenObservation = deepFreeze({ ...observation });
  const frozenNodeData = deepFreeze({
    id: node.id,
    kind: node.kind,
    edges: [...edges],
    grants: [...grants],
  });
  const frozenPriorEffects = deepFreeze([...priorEffects]);

  return {
    observation: frozenObservation,
    node: frozenNodeData,
    priorEffects: frozenPriorEffects,
    canon,
    estimates,
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
    policyId: policy.id,
    priority: policy.priority,
  };
}
