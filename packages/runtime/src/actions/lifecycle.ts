// ActionRun Lifecycle - from proposal to execution
//
// This implements Phase 3.1 of the implementation plan:
// - createActionRun: Create an ActionRun with validation and risk assignment
// - approveActionRun: Approve a pending action (manual or auto)
// - rejectActionRun: Reject a pending action with reason
// - executeActionRun: Execute an approved action and record result

import type {
  ActionRun,
  ActionProposal,
  RiskLevel,
  ActionDefinition,
  Node,
  Id,
} from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { ValidationError, NodeNotFoundError } from '../errors.js';

// --- Error Types ---

/**
 * Error when an ActionRun is not found
 */
export class ActionRunNotFoundError extends Error {
  readonly code = 'ACTION_RUN_NOT_FOUND';
  readonly actionRunId: string;

  constructor(actionRunId: string) {
    super(`ActionRun not found: ${actionRunId}`);
    this.name = 'ActionRunNotFoundError';
    this.actionRunId = actionRunId;
  }
}

/**
 * Error when an invalid state transition is attempted
 */
export class InvalidActionStateError extends Error {
  readonly code = 'INVALID_ACTION_STATE';
  readonly actionRunId: string;
  readonly currentStatus: string;
  readonly attemptedAction: string;

  constructor(actionRunId: string, currentStatus: string, attemptedAction: string) {
    super(
      `Cannot ${attemptedAction} ActionRun ${actionRunId}: current status is "${currentStatus}"`
    );
    this.name = 'InvalidActionStateError';
    this.actionRunId = actionRunId;
    this.currentStatus = currentStatus;
    this.attemptedAction = attemptedAction;
  }
}

/**
 * Error when authority is insufficient for an action
 */
export class InsufficientAuthorityError extends Error {
  readonly code = 'INSUFFICIENT_AUTHORITY';
  readonly nodeId: string;
  readonly requiredRiskLevel: RiskLevel;
  readonly reason: string;

  constructor(nodeId: string, requiredRiskLevel: RiskLevel, reason: string) {
    super(`Node ${nodeId} lacks authority: ${reason}`);
    this.name = 'InsufficientAuthorityError';
    this.nodeId = nodeId;
    this.requiredRiskLevel = requiredRiskLevel;
    this.reason = reason;
  }
}

/**
 * Error when action execution fails
 */
export class ActionExecutionError extends Error {
  readonly code = 'ACTION_EXECUTION_ERROR';
  readonly actionRunId: string;
  readonly actionType: string;
  readonly cause?: Error;

  constructor(actionRunId: string, actionType: string, message: string, cause?: Error) {
    super(`Action execution failed for ${actionRunId} (${actionType}): ${message}`);
    this.name = 'ActionExecutionError';
    this.actionRunId = actionRunId;
    this.actionType = actionType;
    this.cause = cause;
  }
}

// --- Input Types ---

/**
 * Input for creating a new ActionRun
 */
export type CreateActionRunInput = {
  /** Node ID where this action is proposed */
  nodeId: Id;

  /** What triggered this action */
  proposedBy: {
    policyId: Id;
    observationId: Id;
  };

  /** The proposed action */
  action: ActionProposal;

  /**
   * Optional risk level override.
   * If not provided, will use action definition's default or 'medium'.
   */
  riskLevel?: RiskLevel;
};

/**
 * Options for creating an ActionRun
 */
export type CreateActionRunOptions = {
  /** Whether to validate that the node exists. Defaults to true. */
  validateNode?: boolean;

  /** Whether to auto-approve low-risk actions. Defaults to true. */
  autoApproveLowRisk?: boolean;

  /** Action registry for looking up action definitions. Optional. */
  actionRegistry?: ActionRegistry;
};

/**
 * Result of creating an ActionRun
 */
export type CreateActionRunResult = {
  actionRun: ActionRun;
  autoApproved: boolean;
};

/**
 * Input for approving an ActionRun
 */
export type ApproveActionRunInput = {
  /** The ActionRun ID to approve */
  actionRunId: Id;

  /** The node approving the action */
  approverNodeId: Id;

  /** How this approval is happening */
  method: 'manual' | 'auto';
};

/**
 * Input for rejecting an ActionRun
 */
export type RejectActionRunInput = {
  /** The ActionRun ID to reject */
  actionRunId: Id;

  /** The node rejecting the action */
  rejectorNodeId: Id;

  /** Reason for rejection */
  reason: string;
};

/**
 * Input for executing an ActionRun
 */
export type ExecuteActionRunInput = {
  /** The ActionRun ID to execute */
  actionRunId: Id;
};

/**
 * Options for executing an ActionRun
 */
export type ExecuteActionRunOptions = {
  /** Action registry for looking up handlers */
  actionRegistry?: ActionRegistry;

  /** Timeout in milliseconds. Defaults to 30000 (30 seconds). */
  timeoutMs?: number;
};

/**
 * Result of executing an ActionRun
 */
export type ExecuteActionRunResult = {
  actionRun: ActionRun;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
};

// --- Action Registry ---

/**
 * Handler function for executing an action
 */
export type ActionHandler = (
  params: Record<string, unknown>,
  context: ActionExecutionContext
) => Promise<unknown>;

/**
 * Context passed to action handlers
 */
export type ActionExecutionContext = {
  actionRun: ActionRun;
  repos: RepositoryContext;
  node: Node;
};

/**
 * Registry of action definitions and handlers
 */
export type ActionRegistry = {
  /** Get an action definition by type */
  get(actionType: string): ActionDefinition | undefined;

  /** Get the handler for an action type */
  getHandler(actionType: string): ActionHandler | undefined;

  /** Check if an action type is registered */
  has(actionType: string): boolean;
};

/**
 * Create a simple action registry
 */
export function createActionRegistry(): ActionRegistry & {
  register(definition: ActionDefinition, handler: ActionHandler): void;
  unregister(actionType: string): void;
} {
  const definitions = new Map<string, ActionDefinition>();
  const handlers = new Map<string, ActionHandler>();

  return {
    get(actionType: string) {
      return definitions.get(actionType);
    },

    getHandler(actionType: string) {
      return handlers.get(actionType);
    },

    has(actionType: string) {
      return definitions.has(actionType);
    },

    register(definition: ActionDefinition, handler: ActionHandler) {
      if (definitions.has(definition.actionType)) {
        throw new Error(`Action type already registered: ${definition.actionType}`);
      }
      definitions.set(definition.actionType, definition);
      handlers.set(definition.actionType, handler);
    },

    unregister(actionType: string) {
      definitions.delete(actionType);
      handlers.delete(actionType);
    },
  };
}

// --- Risk Level Utilities ---

/**
 * Risk level ordering for comparison
 */
const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Compare two risk levels
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b];
}

/**
 * Check if a risk level requires manual approval
 */
export function requiresManualApproval(riskLevel: RiskLevel): boolean {
  return riskLevel !== 'low';
}

/**
 * Determine the effective risk level for an action
 */
function resolveRiskLevel(
  explicitLevel: RiskLevel | undefined,
  definition: ActionDefinition | undefined
): RiskLevel {
  // Explicit level takes precedence
  if (explicitLevel) return explicitLevel;

  // Use action definition's default
  if (definition) return definition.riskLevel;

  // Default to medium (safe default)
  return 'medium';
}

// --- Validation ---

function validateCreateInput(input: CreateActionRunInput): void {
  if (!input.nodeId || typeof input.nodeId !== 'string') {
    throw new ValidationError('nodeId is required and must be a string', { field: 'nodeId' });
  }

  if (!input.proposedBy) {
    throw new ValidationError('proposedBy is required', { field: 'proposedBy' });
  }

  if (!input.proposedBy.policyId || typeof input.proposedBy.policyId !== 'string') {
    throw new ValidationError('proposedBy.policyId is required and must be a string', {
      field: 'proposedBy.policyId',
    });
  }

  if (!input.proposedBy.observationId || typeof input.proposedBy.observationId !== 'string') {
    throw new ValidationError('proposedBy.observationId is required and must be a string', {
      field: 'proposedBy.observationId',
    });
  }

  if (!input.action) {
    throw new ValidationError('action is required', { field: 'action' });
  }

  if (!input.action.actionType || typeof input.action.actionType !== 'string') {
    throw new ValidationError('action.actionType is required and must be a string', {
      field: 'action.actionType',
    });
  }

  if (input.action.params === undefined || typeof input.action.params !== 'object') {
    throw new ValidationError('action.params is required and must be an object', {
      field: 'action.params',
    });
  }

  if (
    input.riskLevel !== undefined &&
    !['low', 'medium', 'high', 'critical'].includes(input.riskLevel)
  ) {
    throw new ValidationError(
      'riskLevel must be one of: low, medium, high, critical',
      { field: 'riskLevel', details: { provided: input.riskLevel } }
    );
  }
}

// --- Lifecycle Functions ---

/**
 * Create a new ActionRun.
 *
 * This is the entry point for proposed actions. It validates the input,
 * resolves the risk level, and optionally auto-approves low-risk actions.
 *
 * @param repos - Repository context
 * @param input - Action proposal input
 * @param options - Optional configuration
 * @returns The created ActionRun and whether it was auto-approved
 *
 * @example
 * ```typescript
 * const result = await createActionRun(repos, {
 *   nodeId: 'node-123',
 *   proposedBy: { policyId: 'policy-1', observationId: 'obs-1' },
 *   action: { actionType: 'send_email', params: { to: 'user@example.com' } },
 * });
 *
 * if (result.autoApproved) {
 *   // Low-risk action was auto-approved, ready for execution
 * } else {
 *   // Action requires manual approval
 * }
 * ```
 */
export async function createActionRun(
  repos: RepositoryContext,
  input: CreateActionRunInput,
  options: CreateActionRunOptions = {}
): Promise<CreateActionRunResult> {
  const { validateNode = true, autoApproveLowRisk = true, actionRegistry } = options;

  // Validate input
  validateCreateInput(input);

  // Validate node exists
  if (validateNode) {
    const node = await repos.nodes.get(input.nodeId);
    if (!node) {
      throw new NodeNotFoundError(input.nodeId);
    }
  }

  // Look up action definition for risk level
  const definition = actionRegistry?.get(input.action.actionType);

  // Resolve effective risk level
  const riskLevel = resolveRiskLevel(input.riskLevel, definition);

  // Create the ActionRun
  const actionRun = await repos.actionRuns.create({
    nodeId: input.nodeId,
    proposedBy: input.proposedBy,
    action: input.action,
    riskLevel,
  });

  // Auto-approve low-risk actions if enabled
  if (autoApproveLowRisk && riskLevel === 'low') {
    const approved = await repos.actionRuns.approve(actionRun.id, {
      approvedBy: input.nodeId,
      approvedAt: new Date().toISOString(),
      method: 'auto',
    });

    if (approved) {
      return {
        actionRun: approved,
        autoApproved: true,
      };
    }
  }

  return {
    actionRun,
    autoApproved: false,
  };
}

/**
 * Approve an ActionRun.
 *
 * Validates the approver has authority for the action's risk level,
 * then transitions the ActionRun to 'approved' status.
 *
 * @param repos - Repository context
 * @param input - Approval input
 * @returns The approved ActionRun
 * @throws ActionRunNotFoundError if the ActionRun doesn't exist
 * @throws InvalidActionStateError if the ActionRun is not pending
 * @throws InsufficientAuthorityError if the approver lacks authority
 *
 * @example
 * ```typescript
 * const actionRun = await approveActionRun(repos, {
 *   actionRunId: 'action-123',
 *   approverNodeId: 'user-node',
 *   method: 'manual',
 * });
 * ```
 */
export async function approveActionRun(
  repos: RepositoryContext,
  input: ApproveActionRunInput
): Promise<ActionRun> {
  const { actionRunId, approverNodeId, method } = input;

  // Validate input
  if (!actionRunId || typeof actionRunId !== 'string') {
    throw new ValidationError('actionRunId is required and must be a string', {
      field: 'actionRunId',
    });
  }

  if (!approverNodeId || typeof approverNodeId !== 'string') {
    throw new ValidationError('approverNodeId is required and must be a string', {
      field: 'approverNodeId',
    });
  }

  if (!['manual', 'auto'].includes(method)) {
    throw new ValidationError('method must be "manual" or "auto"', {
      field: 'method',
      details: { provided: method },
    });
  }

  // Get the ActionRun
  const actionRun = await repos.actionRuns.get(actionRunId);
  if (!actionRun) {
    throw new ActionRunNotFoundError(actionRunId);
  }

  // Check current status
  if (actionRun.status !== 'pending') {
    throw new InvalidActionStateError(actionRunId, actionRun.status, 'approve');
  }

  // Get the approver node
  const approverNode = await repos.nodes.get(approverNodeId);
  if (!approverNode) {
    throw new NodeNotFoundError(approverNodeId);
  }

  // Check authority based on risk level and node kind
  await validateApprovalAuthority(repos, approverNode, actionRun, method);

  // Perform the approval
  const approved = await repos.actionRuns.approve(actionRunId, {
    approvedBy: approverNodeId,
    approvedAt: new Date().toISOString(),
    method,
  });

  if (!approved) {
    throw new Error(`Failed to approve ActionRun: ${actionRunId}`);
  }

  return approved;
}

/**
 * Validate that a node has authority to approve an action
 */
async function validateApprovalAuthority(
  repos: RepositoryContext,
  approverNode: Node,
  actionRun: ActionRun,
  _method: 'manual' | 'auto'
): Promise<void> {
  const { riskLevel } = actionRun;

  // Subject nodes can approve any action within their node
  if (approverNode.kind === 'subject') {
    // Subject nodes within the same node can approve
    if (approverNode.id === actionRun.nodeId) {
      return;
    }

    // Check if approver has a grant to the action's node
    // For now, we allow subject nodes to approve actions in their scope
    return;
  }

  // Agent nodes have restrictions
  if (approverNode.kind === 'agent') {
    // Agents cannot approve their own actions above low risk
    if (approverNode.id === actionRun.nodeId && riskLevel !== 'low') {
      throw new InsufficientAuthorityError(
        approverNode.id,
        riskLevel,
        'Agents cannot approve their own high-risk actions'
      );
    }

    // Check agent delegation constraints
    const delegation = await repos.nodes.getAgentDelegation(approverNode.id);
    if (delegation) {
      // Check maxRiskLevel constraint
      if (delegation.constraints?.maxRiskLevel) {
        const maxAllowed = RISK_LEVEL_ORDER[delegation.constraints.maxRiskLevel];
        const required = RISK_LEVEL_ORDER[riskLevel];
        if (required > maxAllowed) {
          throw new InsufficientAuthorityError(
            approverNode.id,
            riskLevel,
            `Agent delegation limits approval to ${delegation.constraints.maxRiskLevel} risk level`
          );
        }
      }

      // Check allowedEffects constraint
      if (delegation.constraints?.allowedEffects) {
        const actionType = actionRun.action.actionType;
        if (!delegation.constraints.allowedEffects.includes(actionType)) {
          throw new InsufficientAuthorityError(
            approverNode.id,
            riskLevel,
            `Agent delegation does not allow action type: ${actionType}`
          );
        }
      }

      // Check expiresAt constraint
      if (delegation.constraints?.expiresAt) {
        const expiry = new Date(delegation.constraints.expiresAt);
        if (expiry < new Date()) {
          throw new InsufficientAuthorityError(
            approverNode.id,
            riskLevel,
            'Agent delegation has expired'
          );
        }
      }
    }

    // High and critical risk always require subject node approval
    if (riskLevel === 'high' || riskLevel === 'critical') {
      throw new InsufficientAuthorityError(
        approverNode.id,
        riskLevel,
        `${riskLevel} risk actions require Subject-Node approval`
      );
    }

    return;
  }

  // Object nodes cannot approve actions
  if (approverNode.kind === 'object') {
    throw new InsufficientAuthorityError(
      approverNode.id,
      riskLevel,
      'Object nodes cannot approve actions'
    );
  }
}

/**
 * Reject an ActionRun.
 *
 * Transitions the ActionRun to 'rejected' status with a reason.
 *
 * @param repos - Repository context
 * @param input - Rejection input
 * @returns The rejected ActionRun
 * @throws ActionRunNotFoundError if the ActionRun doesn't exist
 * @throws InvalidActionStateError if the ActionRun is not pending
 *
 * @example
 * ```typescript
 * const actionRun = await rejectActionRun(repos, {
 *   actionRunId: 'action-123',
 *   rejectorNodeId: 'user-node',
 *   reason: 'Action not appropriate at this time',
 * });
 * ```
 */
export async function rejectActionRun(
  repos: RepositoryContext,
  input: RejectActionRunInput
): Promise<ActionRun> {
  const { actionRunId, rejectorNodeId, reason } = input;

  // Validate input
  if (!actionRunId || typeof actionRunId !== 'string') {
    throw new ValidationError('actionRunId is required and must be a string', {
      field: 'actionRunId',
    });
  }

  if (!rejectorNodeId || typeof rejectorNodeId !== 'string') {
    throw new ValidationError('rejectorNodeId is required and must be a string', {
      field: 'rejectorNodeId',
    });
  }

  if (!reason || typeof reason !== 'string') {
    throw new ValidationError('reason is required and must be a string', {
      field: 'reason',
    });
  }

  if (reason.trim() === '') {
    throw new ValidationError('reason cannot be empty', { field: 'reason' });
  }

  // Get the ActionRun
  const actionRun = await repos.actionRuns.get(actionRunId);
  if (!actionRun) {
    throw new ActionRunNotFoundError(actionRunId);
  }

  // Check current status
  if (actionRun.status !== 'pending') {
    throw new InvalidActionStateError(actionRunId, actionRun.status, 'reject');
  }

  // Validate rejector node exists
  const rejectorNode = await repos.nodes.get(rejectorNodeId);
  if (!rejectorNode) {
    throw new NodeNotFoundError(rejectorNodeId);
  }

  // Perform the rejection
  const rejected = await repos.actionRuns.reject(actionRunId, {
    rejectedBy: rejectorNodeId,
    reason,
  });

  if (!rejected) {
    throw new Error(`Failed to reject ActionRun: ${actionRunId}`);
  }

  return rejected;
}

/**
 * Execute an approved ActionRun.
 *
 * Runs the action handler, captures the result or error, and updates
 * the ActionRun status to 'executed' or 'failed'.
 *
 * @param repos - Repository context
 * @param input - Execution input
 * @param options - Optional configuration
 * @returns The executed ActionRun with result
 * @throws ActionRunNotFoundError if the ActionRun doesn't exist
 * @throws InvalidActionStateError if the ActionRun is not approved
 *
 * @example
 * ```typescript
 * const result = await executeActionRun(repos, {
 *   actionRunId: 'action-123',
 * }, {
 *   actionRegistry: myRegistry,
 * });
 *
 * if (result.success) {
 *   console.log('Action completed:', result.result);
 * } else {
 *   console.error('Action failed:', result.error);
 * }
 * ```
 */
export async function executeActionRun(
  repos: RepositoryContext,
  input: ExecuteActionRunInput,
  options: ExecuteActionRunOptions = {}
): Promise<ExecuteActionRunResult> {
  const { actionRunId } = input;
  const { actionRegistry, timeoutMs = 30000 } = options;

  // Validate input
  if (!actionRunId || typeof actionRunId !== 'string') {
    throw new ValidationError('actionRunId is required and must be a string', {
      field: 'actionRunId',
    });
  }

  // Get the ActionRun
  const actionRun = await repos.actionRuns.get(actionRunId);
  if (!actionRun) {
    throw new ActionRunNotFoundError(actionRunId);
  }

  // Check current status
  if (actionRun.status !== 'approved') {
    throw new InvalidActionStateError(actionRunId, actionRun.status, 'execute');
  }

  // Get the node for context
  const node = await repos.nodes.get(actionRun.nodeId);
  if (!node) {
    throw new NodeNotFoundError(actionRun.nodeId);
  }

  // Record start time
  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  // Get the action handler
  const handler = actionRegistry?.getHandler(actionRun.action.actionType);

  if (!handler) {
    // No handler registered - mark as failed
    const endTime = performance.now();
    const completedAt = new Date().toISOString();
    const errorMsg = `No handler registered for action type: ${actionRun.action.actionType}`;

    const failed = await repos.actionRuns.markFailed(actionRunId, {
      startedAt,
      completedAt,
      error: errorMsg,
    });

    return {
      actionRun: failed || actionRun,
      success: false,
      error: errorMsg,
      durationMs: endTime - startTime,
    };
  }

  // Create execution context
  const context: ActionExecutionContext = {
    actionRun,
    repos,
    node,
  };

  // Execute with timeout
  try {
    const resultPromise = handler(actionRun.action.params, context);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Action execution timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const endTime = performance.now();
    const completedAt = new Date().toISOString();

    // Mark as executed
    const executed = await repos.actionRuns.markExecuted(actionRunId, {
      startedAt,
      completedAt,
      result,
    });

    return {
      actionRun: executed || actionRun,
      success: true,
      result,
      durationMs: endTime - startTime,
    };
  } catch (error) {
    const endTime = performance.now();
    const completedAt = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Mark as failed
    const failed = await repos.actionRuns.markFailed(actionRunId, {
      startedAt,
      completedAt,
      error: errorMsg,
    });

    return {
      actionRun: failed || actionRun,
      success: false,
      error: errorMsg,
      durationMs: endTime - startTime,
    };
  }
}

/**
 * Get pending ActionRuns that need approval for a node.
 *
 * This returns ActionRuns with status 'pending' that haven't been auto-approved.
 * Useful for displaying an approval queue in the UI.
 *
 * @param repos - Repository context
 * @param nodeId - Node ID to get pending actions for
 * @returns List of pending ActionRuns requiring approval
 */
export async function getPendingApprovals(
  repos: RepositoryContext,
  nodeId: Id
): Promise<ActionRun[]> {
  return repos.actionRuns.getPendingApproval(nodeId);
}

/**
 * Get ActionRuns by status for a node.
 *
 * @param repos - Repository context
 * @param nodeId - Node ID to query
 * @param statuses - Statuses to filter by
 * @returns Matching ActionRuns
 */
export async function getActionRunsByStatus(
  repos: RepositoryContext,
  nodeId: Id,
  statuses: ActionRun['status'][]
): Promise<ActionRun[]> {
  return repos.actionRuns.query({ nodeId, status: statuses });
}
