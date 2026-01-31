// ActionRun types - auditable execution

import type { Id, Timestamp } from './common.js';
import type { RiskLevel } from './nodes.js';

/**
 * ActionRun status lifecycle
 */
export type ActionRunStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

/**
 * Approval method for ActionRuns
 */
export type ApprovalMethod = 'manual' | 'auto';

/**
 * An ActionProposal is what policies return when they want something to happen
 */
export type ActionProposal = {
  /**
   * The action type, e.g., "create_artifact", "send_notification"
   */
  actionType: string;

  /**
   * Parameters for the action
   */
  params: Record<string, unknown>;

  /**
   * Optional reason for proposing this action
   */
  reason?: string;
};

/**
 * Approval details for an ActionRun
 */
export type ActionApproval = {
  /**
   * Who approved (Subject-Node ID)
   */
  approvedBy: Id;

  /**
   * When it was approved
   */
  approvedAt: Timestamp;

  /**
   * How it was approved
   */
  method: ApprovalMethod;
};

/**
 * Execution details for an ActionRun
 */
export type ActionExecution = {
  /**
   * When execution started
   */
  startedAt: Timestamp;

  /**
   * When execution completed
   */
  completedAt: Timestamp;

  /**
   * The result of execution (structure depends on action type)
   */
  result: unknown;

  /**
   * Error message if execution failed
   */
  error?: string;
};

/**
 * An ActionRun is an auditable record of a proposed and potentially executed action.
 *
 * Flow:
 * 1. Policy proposes action (via propose_action effect)
 * 2. ActionRun created with status "pending"
 * 3. Approval (manual or auto based on risk level)
 * 4. Execution
 * 5. Result recorded
 *
 * All ActionRuns are recorded in canon regardless of outcome.
 */
export type ActionRun = {
  id: Id;
  nodeId: Id;

  /**
   * What triggered this action
   */
  proposedBy: {
    policyId: Id;
    observationId: Id;
  };

  /**
   * The proposed action
   */
  action: ActionProposal;

  /**
   * Risk level (from action definition, may be escalated by policy)
   */
  riskLevel: RiskLevel;

  /**
   * Current status
   */
  status: ActionRunStatus;

  /**
   * Approval details (if approved)
   */
  approval?: ActionApproval;

  /**
   * Rejection details (if rejected)
   */
  rejection?: {
    rejectedBy: Id;
    rejectedAt: Timestamp;
    reason: string;
  };

  /**
   * Execution details (if executed)
   */
  execution?: ActionExecution;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * An ActionDefinition describes an available action type
 */
export type ActionDefinition = {
  /**
   * Unique action type identifier
   */
  actionType: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this action does
   */
  description?: string;

  /**
   * Default risk level for this action
   */
  riskLevel: RiskLevel;

  /**
   * JSON schema for action parameters
   */
  paramsSchema?: Record<string, unknown>;
};
