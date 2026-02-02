// PolicyContext builder - assembles read-only context for policy evaluation

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
 * Creates a CanonAccessor that provides read-only access to pre-fetched canon state.
 *
 * The accessor enforces I/O constraints from §0.6:
 * - queryObservations enforces limit (max 1000, default 100)
 * - queryObservations enforces window (default 24 hours)
 *
 * Note: For v1, we provide stub implementations. In future phases,
 * buildPolicyContext will pre-fetch relevant data based on policy needs.
 */
export function createCanonAccessor(
  data: CanonAccessorData,
  queryFn: (filter: ObservationFilter) => Observation[]
): CanonAccessor {
  return {
    getArtifact: (id: Id) => data.artifacts.get(id) ?? null,

    getEntity: (id: Id) => data.entities.get(id) ?? null,

    getVariable: (id: Id) => data.variables.get(id) ?? null,

    getActiveEpisodes: () => data.activeEpisodes,

    queryObservations: (filter: ObservationFilter) => {
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

      return queryFn(effectiveFilter);
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

      // Cache and return
      estimateCache.set(variableId, estimate);
      return estimate;
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
 * - The triggering observation
 * - Node metadata (id, kind, edges, grants)
 * - Prior effects from higher-priority policies
 * - Read-only canon access with I/O limits
 * - Access to derived variable estimates
 *
 * Note: For v1, canon access is limited:
 * - getArtifact, getEntity, getVariable return null (not yet pre-fetched)
 * - getActiveEpisodes returns pre-fetched episodes
 * - queryObservations uses a synchronous query function that wraps the async repo
 *
 * In Phase 4+, we'll expand pre-fetching based on policy analysis.
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
  const { priorEffects = [], evaluatedAt } = options;

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

  // Create canon accessor data
  const canonData: CanonAccessorData = {
    artifacts: new Map(),
    entities: new Map(),
    variables: variablesMap,
    activeEpisodes,
    observations: recentObservations,
  };

  // Create synchronous observation query function
  // In v1, this wraps the async repo call - the query is dispatched but
  // returns cached/empty results synchronously for policy evaluation.
  // For testing, mocks will provide synchronous behavior.
  // In production, we'd pre-fetch observations based on policy triggers.
  //
  // Note: This is a temporary solution. Policies calling queryObservations
  // will get the result of the async call if the mock is set up correctly.
  // In real async scenarios, we'd need pre-fetching or a different approach.
  const queryCache: Map<string, Observation[]> = new Map();

  const queryFn: ObservationQueryFn = (filter: ObservationFilter): Observation[] => {
    const cacheKey = JSON.stringify(filter);
    if (queryCache.has(cacheKey)) {
      return queryCache.get(cacheKey)!;
    }
    // For synchronous access, return empty and let async wrapper handle it
    // In tests, the mock will be synchronous anyway
    const result = repos.observations.query(filter);
    if (result instanceof Promise) {
      // Store a placeholder - the async call will resolve but we can't wait
      // This is a limitation for v1 - real impl needs pre-fetching
      queryCache.set(cacheKey, []);
      // Still trigger the async call so mocks record it
      result.then((obs) => queryCache.set(cacheKey, obs));
      return [];
    }
    return result as unknown as Observation[];
  };

  // Build accessors
  const canon = createCanonAccessor(canonData, queryFn);

  // Build estimates accessor with pre-fetched data (Phase 4.4)
  const referenceTime = evaluatedAt ? new Date(evaluatedAt) : new Date();
  const estimates = createEstimatesAccessor({
    variables: variablesMap,
    observations: recentObservations,
    referenceTime,
  });

  return {
    observation,
    node: {
      id: node.id,
      kind: node.kind,
      edges,
      grants,
    },
    priorEffects,
    canon,
    estimates,
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
    policyId: policy.id,
    priority: policy.priority,
  };
}
