// Prism Types - The Commit Boundary
//
// Prism is the ONLY interface that mutates canon.
// All mutations flow through Prism operations which provide:
// - Transaction wrapping (all-or-nothing commits)
// - Audit logging (who changed what, when)
// - Authority validation (permission checks before mutation)
// - Provenance tracking (causality chain)

import type { Id, QuerySpec } from './common.js';
import type { Artifact, PageDoc } from './artifacts.js';
import type { Episode, EpisodeIntent } from './episodes.js';
import type { Variable, ViableRange, ComputeSpec } from './variables.js';
import type { ActionRun } from './actions.js';
import type { Surface, SurfaceVisibility, SurfaceKind, LayoutSpec } from './surfaces.js';
import type { Node, NodeKind, EdgeType, AgentDelegation } from './nodes.js';
import type { Grant, GrantScope } from './grants.js';
import type { Entity } from './entities.js';
import type { Policy, EntityEventPayload } from './policies.js';

// ============================================================================
// Audit Entry - records what changed, when, and why
// ============================================================================

/**
 * Audit entry recorded for every Prism operation.
 * This is the audit trail that enables replay and inspection.
 */
export type AuditEntry = {
  /** Unique ID for this audit entry */
  id: Id;

  /** When this operation occurred */
  timestamp: string;

  /** The node where this operation happened */
  nodeId: Id;

  /** The actor who performed this operation */
  actor: AuditActor;

  /** The type of operation performed */
  operationType: PrismOperationType;

  /** The resource type being modified */
  resourceType: PrismResourceType;

  /** The ID of the resource being modified (if applicable) */
  resourceId?: Id;

  /** Operation-specific details */
  details: Record<string, unknown>;

  /** Causality chain - what triggered this operation */
  causedBy?: AuditCausality;

  /** Whether the operation succeeded */
  success: boolean;

  /** Error message if the operation failed */
  error?: string;
};

/**
 * The actor who performed an operation.
 */
export type AuditActor = {
  /** The node performing the operation */
  nodeId: Id;

  /** The kind of node */
  kind: NodeKind;

  /** If this is an agent, the sponsor node */
  sponsorId?: Id;

  /** How this operation was initiated */
  method: 'manual' | 'policy_effect' | 'action_execution' | 'api' | 'system';
};

/**
 * Causality chain for audit entries.
 * Tracks what triggered this operation.
 */
export type AuditCausality = {
  /** The observation that triggered this (if policy-initiated) */
  observationId?: Id;

  /** The policy that produced this effect (if policy-initiated) */
  policyId?: Id;

  /** The ActionRun that executed this (if action-initiated) */
  actionRunId?: Id;

  /** The effect that triggered this (if effect-initiated) */
  effectType?: string;
};

// ============================================================================
// Operation Types - enumeration of all Prism operations
// ============================================================================

/**
 * All possible Prism operation types.
 */
export type PrismOperationType =
  // Artifact operations
  | 'create_artifact'
  | 'update_artifact'
  | 'update_artifact_status'
  | 'delete_artifact'
  // Episode operations
  | 'create_episode'
  | 'update_episode'
  | 'update_episode_status'
  // Variable operations
  | 'create_variable'
  | 'update_variable'
  | 'delete_variable'
  // ActionRun operations
  | 'approve_action_run'
  | 'reject_action_run'
  | 'execute_action_run'
  // Surface operations
  | 'create_surface'
  | 'update_surface'
  | 'delete_surface'
  // Entity operations
  | 'create_entity'
  | 'append_entity_event'
  // Node operations
  | 'create_node'
  | 'update_node'
  | 'add_edge'
  | 'remove_edge'
  | 'set_agent_delegation'
  // Grant operations
  | 'create_grant'
  | 'revoke_grant'
  // Policy operations
  | 'create_policy'
  | 'update_policy'
  | 'delete_policy';

/**
 * Resource types that Prism can mutate.
 */
export type PrismResourceType =
  | 'artifact'
  | 'episode'
  | 'variable'
  | 'action_run'
  | 'surface'
  | 'entity'
  | 'node'
  | 'edge'
  | 'grant'
  | 'policy';

// ============================================================================
// Prism Operation Inputs
// ============================================================================

/**
 * Base input type for all Prism operations.
 * All operations include actor information for audit.
 */
export type PrismOperationBase = {
  /** The actor performing this operation */
  actor: {
    nodeId: Id;
    method?: AuditActor['method'];
  };

  /** Optional causality information */
  causedBy?: AuditCausality;
};

// --- Artifact Operations ---

export type CreateArtifactOperation = PrismOperationBase & {
  type: 'create_artifact';
  nodeId: Id;
  artifact: {
    id?: Id;
    title: string;
    about: string;
    notes?: string;
    page: PageDoc;
    status?: 'draft' | 'active' | 'published' | 'archived';
    entityRefs?: Id[];
  };
  /** Optional revision message */
  revision?: {
    message?: string;
  };
};

export type UpdateArtifactOperation = PrismOperationBase & {
  type: 'update_artifact';
  artifactId: Id;
  updates: {
    title?: string;
    about?: string;
    notes?: string;
    page?: PageDoc;
    entityRefs?: Id[];
  };
  /** Optional revision message */
  revision?: {
    message?: string;
  };
};

export type UpdateArtifactStatusOperation = PrismOperationBase & {
  type: 'update_artifact_status';
  artifactId: Id;
  status: 'draft' | 'active' | 'published' | 'archived';
};

export type DeleteArtifactOperation = PrismOperationBase & {
  type: 'delete_artifact';
  artifactId: Id;
};

// --- Episode Operations ---

export type CreateEpisodeOperation = PrismOperationBase & {
  type: 'create_episode';
  nodeId: Id;
  episode: {
    id?: Id;
    title: string;
    description?: string;
    kind: 'regulatory' | 'exploratory';
    variables: Array<{
      variableId: Id;
      intent: EpisodeIntent;
    }>;
    startsAt?: string;
    endsAt?: string;
    relatedArtifactIds?: Id[];
  };
};

export type UpdateEpisodeOperation = PrismOperationBase & {
  type: 'update_episode';
  episodeId: Id;
  updates: {
    title?: string;
    description?: string;
    variables?: Array<{
      variableId: Id;
      intent: EpisodeIntent;
    }>;
    startsAt?: string;
    endsAt?: string;
    relatedArtifactIds?: Id[];
  };
};

export type UpdateEpisodeStatusOperation = PrismOperationBase & {
  type: 'update_episode_status';
  episodeId: Id;
  status: 'planned' | 'active' | 'completed' | 'abandoned';
};

// --- Variable Operations ---

export type CreateVariableOperation = PrismOperationBase & {
  type: 'create_variable';
  nodeId: Id;
  variable: {
    id?: Id;
    key: string;
    title: string;
    description?: string;
    kind: 'continuous' | 'ordinal' | 'categorical' | 'boolean';
    unit?: string;
    viableRange?: ViableRange;
    preferredRange?: ViableRange;
    computeSpecs?: ComputeSpec[];
  };
};

export type UpdateVariableOperation = PrismOperationBase & {
  type: 'update_variable';
  variableId: Id;
  updates: {
    title?: string;
    description?: string;
    kind?: 'continuous' | 'ordinal' | 'categorical' | 'boolean';
    unit?: string;
    viableRange?: ViableRange;
    preferredRange?: ViableRange;
    computeSpecs?: ComputeSpec[];
  };
};

export type DeleteVariableOperation = PrismOperationBase & {
  type: 'delete_variable';
  variableId: Id;
};

// --- ActionRun Operations ---

export type ApproveActionRunOperation = PrismOperationBase & {
  type: 'approve_action_run';
  actionRunId: Id;
  method: 'manual' | 'auto';
};

export type RejectActionRunOperation = PrismOperationBase & {
  type: 'reject_action_run';
  actionRunId: Id;
  reason: string;
};

export type ExecuteActionRunOperation = PrismOperationBase & {
  type: 'execute_action_run';
  actionRunId: Id;
  /** Timeout in milliseconds */
  timeoutMs?: number;
};

// --- Surface Operations ---

export type CreateSurfaceOperation = PrismOperationBase & {
  type: 'create_surface';
  nodeId: Id;
  surface: {
    id?: Id;
    kind: SurfaceKind;
    title: string;
    visibility: SurfaceVisibility;
    entry?: { artifactId?: Id; query?: QuerySpec };
    layoutId?: Id;
    inlineLayout?: LayoutSpec;
  };
};

export type UpdateSurfaceOperation = PrismOperationBase & {
  type: 'update_surface';
  surfaceId: Id;
  updates: {
    title?: string;
    visibility?: SurfaceVisibility;
    entry?: { artifactId?: Id; query?: QuerySpec };
    layoutId?: Id;
    inlineLayout?: LayoutSpec;
  };
};

export type DeleteSurfaceOperation = PrismOperationBase & {
  type: 'delete_surface';
  surfaceId: Id;
};

// --- Entity Operations ---

export type CreateEntityOperation = PrismOperationBase & {
  type: 'create_entity';
  nodeId: Id;
  entity: {
    id?: Id;
    typeId: Id;
    initialState?: Record<string, unknown>;
  };
};

export type AppendEntityEventOperation = PrismOperationBase & {
  type: 'append_entity_event';
  entityId: Id;
  event: EntityEventPayload;
};

// --- Node Operations ---

export type CreateNodeOperation = PrismOperationBase & {
  type: 'create_node';
  node: {
    id?: Id;
    kind: NodeKind;
    name: string;
    metadata?: Record<string, unknown>;
  };
};

export type UpdateNodeOperation = PrismOperationBase & {
  type: 'update_node';
  nodeId: Id;
  updates: {
    name?: string;
    metadata?: Record<string, unknown>;
  };
};

export type AddEdgeOperation = PrismOperationBase & {
  type: 'add_edge';
  fromNodeId: Id;
  toNodeId: Id;
  edgeType: EdgeType;
  metadata?: Record<string, unknown>;
};

export type RemoveEdgeOperation = PrismOperationBase & {
  type: 'remove_edge';
  fromNodeId: Id;
  toNodeId: Id;
  edgeType: EdgeType;
};

export type SetAgentDelegationOperation = PrismOperationBase & {
  type: 'set_agent_delegation';
  agentNodeId: Id;
  delegation: Omit<AgentDelegation, 'agentNodeId' | 'grantedAt'>;
};

// --- Grant Operations ---

export type CreateGrantOperation = PrismOperationBase & {
  type: 'create_grant';
  grant: {
    id?: Id;
    granteeNodeId: Id;
    resourceType: string;
    resourceId: Id;
    scopes: GrantScope[];
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  };
};

export type RevokeGrantOperation = PrismOperationBase & {
  type: 'revoke_grant';
  grantId: Id;
  reason?: string;
};

// --- Policy Operations ---

export type CreatePolicyOperation = PrismOperationBase & {
  type: 'create_policy';
  nodeId: Id;
  policy: {
    id?: Id;
    name: string;
    description?: string;
    priority: number;
    enabled: boolean;
    trigger: { observationType?: string; observationTypePrefix?: string };
    evaluatorCode: string;
  };
};

export type UpdatePolicyOperation = PrismOperationBase & {
  type: 'update_policy';
  policyId: Id;
  updates: {
    name?: string;
    description?: string;
    priority?: number;
    enabled?: boolean;
    trigger?: { observationType?: string; observationTypePrefix?: string };
    evaluatorCode?: string;
  };
};

export type DeletePolicyOperation = PrismOperationBase & {
  type: 'delete_policy';
  policyId: Id;
};

// ============================================================================
// Union of all operations
// ============================================================================

export type PrismOperation =
  // Artifact operations
  | CreateArtifactOperation
  | UpdateArtifactOperation
  | UpdateArtifactStatusOperation
  | DeleteArtifactOperation
  // Episode operations
  | CreateEpisodeOperation
  | UpdateEpisodeOperation
  | UpdateEpisodeStatusOperation
  // Variable operations
  | CreateVariableOperation
  | UpdateVariableOperation
  | DeleteVariableOperation
  // ActionRun operations
  | ApproveActionRunOperation
  | RejectActionRunOperation
  | ExecuteActionRunOperation
  // Surface operations
  | CreateSurfaceOperation
  | UpdateSurfaceOperation
  | DeleteSurfaceOperation
  // Entity operations
  | CreateEntityOperation
  | AppendEntityEventOperation
  // Node operations
  | CreateNodeOperation
  | UpdateNodeOperation
  | AddEdgeOperation
  | RemoveEdgeOperation
  | SetAgentDelegationOperation
  // Grant operations
  | CreateGrantOperation
  | RevokeGrantOperation
  // Policy operations
  | CreatePolicyOperation
  | UpdatePolicyOperation
  | DeletePolicyOperation;

// ============================================================================
// Operation Results
// ============================================================================

/**
 * Base result type for all Prism operations.
 */
export type PrismOperationResult<T = unknown> = {
  /** Whether the operation succeeded */
  success: boolean;

  /** The result data (if successful) */
  data?: T;

  /** Error message (if failed) */
  error?: string;

  /** The audit entry for this operation */
  audit: AuditEntry;
};

/**
 * Result types for specific operations.
 */
export type CreateArtifactResult = PrismOperationResult<{ artifact: Artifact }>;
export type UpdateArtifactResult = PrismOperationResult<{ artifact: Artifact }>;
export type CreateEpisodeResult = PrismOperationResult<{ episode: Episode }>;
export type UpdateEpisodeResult = PrismOperationResult<{ episode: Episode }>;
export type CreateVariableResult = PrismOperationResult<{ variable: Variable }>;
export type UpdateVariableResult = PrismOperationResult<{ variable: Variable }>;
export type ApproveActionRunResult = PrismOperationResult<{ actionRun: ActionRun }>;
export type RejectActionRunResult = PrismOperationResult<{ actionRun: ActionRun }>;
export type ExecuteActionRunResult = PrismOperationResult<{
  actionRun: ActionRun;
  result?: unknown;
  durationMs: number;
}>;
export type CreateSurfaceResult = PrismOperationResult<{ surface: Surface }>;
export type UpdateSurfaceResult = PrismOperationResult<{ surface: Surface }>;
export type CreateEntityResult = PrismOperationResult<{ entity: Entity }>;
export type AppendEntityEventResult = PrismOperationResult<{ entity: Entity }>;
export type CreateNodeResult = PrismOperationResult<{ node: Node }>;
export type UpdateNodeResult = PrismOperationResult<{ node: Node }>;
export type CreateGrantResult = PrismOperationResult<{ grant: Grant }>;
export type CreatePolicyResult = PrismOperationResult<{ policy: Policy }>;
export type UpdatePolicyResult = PrismOperationResult<{ policy: Policy }>;

// ============================================================================
// Prism Configuration
// ============================================================================

/**
 * Configuration options for Prism.
 */
export type PrismConfig = {
  /** Whether to enable audit logging (default: true) */
  auditEnabled?: boolean;

  /** Whether to use transactions for operations (default: true) */
  transactionsEnabled?: boolean;

  /** Default timeout for action execution in milliseconds */
  defaultActionTimeoutMs?: number;

  /** Callback for audit entries (e.g., for external logging) */
  onAudit?: (entry: AuditEntry) => void | Promise<void>;
};
