// Policy and Effect types

import type { Id, Timestamp, ObservationFilter } from './common.js';
import type { Observation } from './observations.js';
import type { Artifact } from './artifacts.js';
import type { Entity } from './entities.js';
import type { Variable, VariableEstimate } from './variables.js';
import type { Episode } from './episodes.js';
import type { Edge, NodeKind } from './nodes.js';
import type { Grant } from './grants.js';
import type { ActionProposal } from './actions.js';

/**
 * Entity event for the create_entity_event effect
 */
export type EntityEventPayload = {
  type: string;
  data: unknown;
  timestamp?: Timestamp;
};

/**
 * Effect types that policies can return.
 * Effects are declarative instructions - they don't execute anything directly.
 */
export type Effect =
  | { effect: 'route_observation'; toNodeId: Id }
  | { effect: 'create_entity_event'; entityId: Id; event: EntityEventPayload }
  | { effect: 'propose_action'; action: ActionProposal }
  | { effect: 'tag_observation'; tags: string[] }
  | { effect: 'suppress'; reason: string }
  | { effect: 'log'; level: 'debug' | 'info' | 'warn'; message: string }
  // Pack effects use namespaced format
  | { effect: `pack:${string}:${string}`; [key: string]: unknown };

/**
 * Read-only access to canon state for policies.
 *
 * I/O CONSTRAINTS (Performance Invariants):
 * - queryObservations enforces limit (max 1000, default 100)
 * - queryObservations enforces window (default 24 hours)
 * - Policies should request only the data they need
 * - Large result sets indicate a policy design issue
 */
export type CanonAccessor = {
  getArtifact(id: Id): Artifact | null;
  getEntity(id: Id): Entity | null;
  getVariable(id: Id): Variable | null;
  getActiveEpisodes(): Episode[];

  /**
   * Query observations with mandatory limits.
   * @param filter - Must include limit (max 1000). Window defaults to 24h.
   */
  queryObservations(filter: ObservationFilter): Observation[];
};

/**
 * Access to derived variable estimates
 */
export type EstimatesAccessor = {
  getVariableEstimate(variableId: Id): VariableEstimate | null;
};

/**
 * The context passed to policy evaluation.
 * Policies MUST be pure - they can read this context but cannot modify state.
 */
export type PolicyContext = {
  /**
   * The observation that triggered this evaluation
   */
  observation: Observation;

  /**
   * The node being evaluated
   */
  node: {
    id: Id;
    kind: NodeKind;
    edges: Edge[];
    grants: Grant[];
  };

  /**
   * Effects from higher-priority policies in this evaluation cycle
   */
  priorEffects: Effect[];

  /**
   * Read-only access to canon state
   */
  canon: CanonAccessor;

  /**
   * Access to derived variable estimates (non-canon)
   */
  estimates: EstimatesAccessor;

  /**
   * When this evaluation is happening
   */
  evaluatedAt: Timestamp;

  /**
   * The policy being evaluated
   */
  policyId: Id;

  /**
   * This policy's priority (lower = higher priority)
   */
  priority: number;
};

/**
 * A Policy is a pure function that evaluates observations and returns effects.
 *
 * Policies:
 * - Access no storage directly
 * - Call no network
 * - Produce declarative effects
 *
 * Purity is convention-enforced, not language-enforced.
 */
export type Policy = {
  id: Id;
  nodeId: Id;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Priority for evaluation order (lower = higher priority)
   */
  priority: number;

  /**
   * Whether this policy is currently active
   */
  enabled: boolean;

  /**
   * Observation types this policy responds to (supports wildcards)
   * e.g., ["health.*", "work.task.completed"]
   */
  triggers: string[];

  /**
   * The policy implementation
   * In v1, this is TypeScript/JavaScript code as a string
   * Future versions may support JSON, WASM, etc.
   */
  implementation: {
    kind: 'typescript';
    code: string;
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * The signature of a policy evaluation function
 */
export type PolicyEvaluator = (ctx: PolicyContext) => Effect[];
