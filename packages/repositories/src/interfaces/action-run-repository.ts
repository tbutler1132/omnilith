import type {
  Id,
  ActionRun,
  ActionRunStatus,
  ActionProposal,
  ActionApproval,
  ActionExecution,
  RiskLevel,
} from '@omnilith/protocol';

/**
 * Input for creating a new ActionRun
 */
export type CreateActionRunInput = {
  id?: Id;
  nodeId: Id;
  proposedBy: {
    policyId: Id;
    observationId: Id;
  };
  action: ActionProposal;
  riskLevel: RiskLevel;
};

/**
 * Filter for querying ActionRuns
 */
export type ActionRunFilter = {
  nodeId?: Id;
  status?: ActionRunStatus[];
  riskLevel?: RiskLevel[];
  policyId?: Id;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for ActionRun operations.
 *
 * ActionRuns are the auditable execution records of policy-proposed actions.
 * They track the full lifecycle: pending → approved/rejected → executed/failed.
 *
 * Low-risk actions can be auto-approved; higher risks require human approval.
 * ActionRuns are canon and form an audit trail.
 */
export interface ActionRunRepository {
  /**
   * Create a new ActionRun in 'pending' status
   */
  create(input: CreateActionRunInput): Promise<ActionRun>;

  /**
   * Get an ActionRun by ID
   * @returns ActionRun or null if not found
   */
  get(id: Id): Promise<ActionRun | null>;

  /**
   * Query ActionRuns with filters
   */
  query(filter: ActionRunFilter): Promise<ActionRun[]>;

  /**
   * Get pending ActionRuns for a Node
   */
  getPending(nodeId: Id): Promise<ActionRun[]>;

  /**
   * Get pending ActionRuns that need approval (excludes auto-approved low-risk)
   */
  getPendingApproval(nodeId: Id): Promise<ActionRun[]>;

  /**
   * Update ActionRun status to 'approved'
   */
  approve(id: Id, approval: ActionApproval): Promise<ActionRun | null>;

  /**
   * Update ActionRun status to 'rejected'
   */
  reject(
    id: Id,
    rejection: { rejectedBy: Id; reason: string }
  ): Promise<ActionRun | null>;

  /**
   * Update ActionRun status to 'executed' with result
   */
  markExecuted(id: Id, execution: ActionExecution): Promise<ActionRun | null>;

  /**
   * Update ActionRun status to 'failed' with error
   */
  markFailed(
    id: Id,
    execution: Omit<ActionExecution, 'result'> & { error: string }
  ): Promise<ActionRun | null>;

  /**
   * Count ActionRuns by status for a Node
   */
  countByStatus(nodeId: Id): Promise<Record<ActionRunStatus, number>>;
}
