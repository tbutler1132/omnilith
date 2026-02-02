// Prism - The Commit Boundary
//
// This is the core Prism implementation that:
// 1. Dispatches operations to handlers
// 2. Wraps operations in transactions
// 3. Creates audit entries
// 4. Validates authority before operations

import type {
  Id,
  AuditEntry,
  AuditActor,
  PrismConfig,
  PrismOperation,
  PrismOperationType,
  PrismResourceType,
  PrismOperationResult,
  // Operation types
  CreateArtifactOperation,
  UpdateArtifactOperation,
  UpdateArtifactStatusOperation,
  DeleteArtifactOperation,
  CreateEpisodeOperation,
  UpdateEpisodeOperation,
  UpdateEpisodeStatusOperation,
  CreateVariableOperation,
  UpdateVariableOperation,
  DeleteVariableOperation,
  ApproveActionRunOperation,
  RejectActionRunOperation,
  ExecuteActionRunOperation,
  CreateSurfaceOperation,
  UpdateSurfaceOperation,
  DeleteSurfaceOperation,
  CreateEntityOperation,
  AppendEntityEventOperation,
  CreateNodeOperation,
  UpdateNodeOperation,
  AddEdgeOperation,
  RemoveEdgeOperation,
  SetAgentDelegationOperation,
  CreateGrantOperation,
  RevokeGrantOperation,
  CreatePolicyOperation,
  UpdatePolicyOperation,
  DeletePolicyOperation,
  Node,
} from '@omnilith/protocol';
import type {
  RepositoryContext,
  TransactionalRepositoryContext,
} from '@omnilith/repositories';
import type { AuditStore } from './audit.js';
import type { ActionRegistry } from '../actions/lifecycle.js';
import {
  PrismValidationError,
  PrismAuthorizationError,
  PrismOperationError,
} from './errors.js';

/**
 * Options for creating a Prism instance.
 */
export type PrismOptions = {
  /** Repository context (must support transactions for full Prism features) */
  repos: RepositoryContext | TransactionalRepositoryContext;

  /** Audit store for recording operations */
  auditStore: AuditStore;

  /** Optional action registry for action execution */
  actionRegistry?: ActionRegistry;

  /** Optional configuration */
  config?: PrismConfig;
};

/**
 * Check if a repository context supports transactions.
 */
function isTransactional(
  repos: RepositoryContext | TransactionalRepositoryContext
): repos is TransactionalRepositoryContext {
  return 'transaction' in repos && typeof repos.transaction === 'function';
}

/**
 * Prism - The Commit Boundary
 *
 * All mutations to canon MUST go through Prism.
 * Prism provides:
 * - Transaction wrapping (atomic operations)
 * - Audit logging (who changed what, when)
 * - Authority validation (permission checks)
 * - Provenance tracking (causality chain)
 *
 * @example
 * ```ts
 * const prism = createPrism({
 *   repos: createTransactionalPgRepositoryContext(db),
 *   auditStore: createInMemoryAuditStore(),
 * });
 *
 * // Create an artifact through Prism
 * const result = await prism.execute({
 *   type: 'create_artifact',
 *   actor: { nodeId: 'user-node', method: 'manual' },
 *   nodeId: 'node-1',
 *   artifact: {
 *     title: 'My Document',
 *     about: 'Description',
 *     page: { version: 1, blocks: [] },
 *   },
 * });
 *
 * if (result.success) {
 *   console.log('Created artifact:', result.data.artifact);
 * }
 * ```
 */
export class Prism {
  private repos: RepositoryContext | TransactionalRepositoryContext;
  private auditStore: AuditStore;
  private actionRegistry?: ActionRegistry;
  private config: Required<PrismConfig>;

  constructor(options: PrismOptions) {
    this.repos = options.repos;
    this.auditStore = options.auditStore;
    this.actionRegistry = options.actionRegistry;
    this.config = {
      auditEnabled: options.config?.auditEnabled ?? true,
      transactionsEnabled: options.config?.transactionsEnabled ?? true,
      defaultActionTimeoutMs: options.config?.defaultActionTimeoutMs ?? 30000,
      onAudit: options.config?.onAudit ?? (() => {}),
    };
  }

  /**
   * Execute a Prism operation.
   *
   * This is the main entry point for all canon mutations.
   * Operations are validated, authorized, executed (optionally in a transaction),
   * and audited.
   *
   * @param operation The operation to execute
   * @returns The result of the operation including audit entry
   */
  async execute<T extends PrismOperation>(
    operation: T
  ): Promise<PrismOperationResult<unknown>> {
    const startTime = Date.now();
    const auditId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Get operation metadata
    const { operationType, resourceType, resourceId } = getOperationMetadata(operation);

    // Get actor node to check kind and authorization
    let actorNode: Node | null = null;
    try {
      actorNode = await this.repos.nodes.get(operation.actor.nodeId);
    } catch {
      // Node not found - will be handled in authorization check
    }

    // Build audit actor
    const auditActor: AuditActor = {
      nodeId: operation.actor.nodeId,
      kind: actorNode?.kind ?? 'subject',
      sponsorId: undefined, // Will be filled in from agent delegation if applicable
      method: operation.actor.method ?? 'api',
    };

    // If actor is an agent, get sponsor ID from delegation
    if (actorNode?.kind === 'agent') {
      try {
        const delegation = await this.repos.nodes.getAgentDelegation(operation.actor.nodeId);
        if (delegation) {
          auditActor.sponsorId = delegation.sponsorNodeId;
        }
      } catch {
        // Delegation not found - continue without sponsor
      }
    }

    // Create audit entry (will be updated with result)
    const auditEntry: AuditEntry = {
      id: auditId,
      timestamp,
      nodeId: getOperationNodeId(operation) ?? operation.actor.nodeId,
      actor: auditActor,
      operationType,
      resourceType,
      resourceId,
      details: {},
      causedBy: operation.causedBy,
      success: false,
      error: undefined,
    };

    try {
      // Validate operation
      await this.validateOperation(operation);

      // Check authorization
      await this.checkAuthorization(operation, actorNode);

      // Execute operation (optionally in transaction)
      let result: unknown;
      if (this.config.transactionsEnabled && isTransactional(this.repos)) {
        result = await this.repos.transaction(async (txRepos) => {
          return this.executeOperation(operation, txRepos);
        });
      } else {
        result = await this.executeOperation(operation, this.repos);
      }

      // Update audit entry with success
      auditEntry.success = true;
      auditEntry.details = {
        durationMs: Date.now() - startTime,
        result: sanitizeForAudit(result),
      };

      // Store audit entry
      if (this.config.auditEnabled) {
        await this.auditStore.append(auditEntry);
        await this.config.onAudit(auditEntry);
      }

      return {
        success: true,
        data: result,
        audit: auditEntry,
      };
    } catch (error) {
      // Update audit entry with failure
      auditEntry.success = false;
      auditEntry.error = error instanceof Error ? error.message : String(error);
      auditEntry.details = {
        durationMs: Date.now() - startTime,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      };

      // Store audit entry
      if (this.config.auditEnabled) {
        await this.auditStore.append(auditEntry);
        await this.config.onAudit(auditEntry);
      }

      return {
        success: false,
        error: auditEntry.error,
        audit: auditEntry,
      };
    }
  }

  /**
   * Execute multiple operations in a single transaction.
   *
   * If any operation fails, all operations are rolled back.
   *
   * @param operations The operations to execute
   * @returns Results for each operation
   */
  async executeBatch(
    operations: PrismOperation[]
  ): Promise<PrismOperationResult<unknown>[]> {
    if (!isTransactional(this.repos)) {
      // Execute sequentially without transaction
      const results: PrismOperationResult<unknown>[] = [];
      for (const op of operations) {
        results.push(await this.execute(op));
      }
      return results;
    }

    // Execute all in a single transaction
    const startTime = Date.now();
    const batchId = crypto.randomUUID();
    const results: PrismOperationResult<unknown>[] = [];

    try {
      await this.repos.transaction(async (txRepos) => {
        for (const operation of operations) {
          const auditId = crypto.randomUUID();
          const timestamp = new Date().toISOString();
          const { operationType, resourceType, resourceId } = getOperationMetadata(operation);

          let actorNode: Node | null = null;
          try {
            actorNode = await txRepos.nodes.get(operation.actor.nodeId);
          } catch {
            // Continue
          }

          const auditActor: AuditActor = {
            nodeId: operation.actor.nodeId,
            kind: actorNode?.kind ?? 'subject',
            method: operation.actor.method ?? 'api',
          };

          const auditEntry: AuditEntry = {
            id: auditId,
            timestamp,
            nodeId: getOperationNodeId(operation) ?? operation.actor.nodeId,
            actor: auditActor,
            operationType,
            resourceType,
            resourceId,
            details: { batchId },
            causedBy: operation.causedBy,
            success: false,
          };

          try {
            await this.validateOperation(operation);
            await this.checkAuthorization(operation, actorNode);
            const result = await this.executeOperation(operation, txRepos);

            auditEntry.success = true;
            auditEntry.details = {
              batchId,
              durationMs: Date.now() - startTime,
              result: sanitizeForAudit(result),
            };

            if (this.config.auditEnabled) {
              await this.auditStore.append(auditEntry);
            }

            results.push({ success: true, data: result, audit: auditEntry });
          } catch (error) {
            auditEntry.success = false;
            auditEntry.error = error instanceof Error ? error.message : String(error);

            if (this.config.auditEnabled) {
              await this.auditStore.append(auditEntry);
            }

            // Rethrow to trigger rollback
            throw error;
          }
        }
      });

      return results;
    } catch (error) {
      // Transaction was rolled back - return failure for all remaining operations
      const errorMessage = error instanceof Error ? error.message : String(error);
      while (results.length < operations.length) {
        results.push({
          success: false,
          error: `Batch transaction rolled back: ${errorMessage}`,
          audit: {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            nodeId: operations[results.length].actor.nodeId,
            actor: {
              nodeId: operations[results.length].actor.nodeId,
              kind: 'subject',
              method: 'api',
            },
            operationType: getOperationMetadata(operations[results.length]).operationType,
            resourceType: getOperationMetadata(operations[results.length]).resourceType,
            details: { batchId, rolledBack: true },
            success: false,
            error: `Batch transaction rolled back: ${errorMessage}`,
          },
        });
      }
      return results;
    }
  }

  /**
   * Validate operation input.
   */
  private async validateOperation(operation: PrismOperation): Promise<void> {
    // Validate actor
    if (!operation.actor?.nodeId) {
      throw new PrismValidationError('actor.nodeId is required', {
        field: 'actor.nodeId',
      });
    }

    // Validate operation-specific fields
    switch (operation.type) {
      case 'create_artifact':
        validateCreateArtifact(operation);
        break;
      case 'update_artifact':
        validateUpdateArtifact(operation);
        break;
      case 'create_episode':
        validateCreateEpisode(operation);
        break;
      case 'create_variable':
        validateCreateVariable(operation);
        break;
      case 'approve_action_run':
      case 'reject_action_run':
      case 'execute_action_run':
        validateActionRunOperation(operation);
        break;
      // Add more validation as needed
    }
  }

  /**
   * Check if the actor has authorization for the operation.
   */
  private async checkAuthorization(
    operation: PrismOperation,
    actorNode: Node | null
  ): Promise<void> {
    const { operationType, resourceType, resourceId } = getOperationMetadata(operation);

    // Actor node must exist
    if (!actorNode) {
      throw new PrismAuthorizationError(
        `Actor node not found: ${operation.actor.nodeId}`,
        {
          actorNodeId: operation.actor.nodeId,
          operationType,
          resourceType,
          resourceId,
        }
      );
    }

    // Object nodes cannot perform most mutations
    if (actorNode.kind === 'object') {
      // Object nodes can only be modified by other nodes, not initiate changes
      throw new PrismAuthorizationError(
        'Object nodes cannot initiate mutations',
        {
          actorNodeId: operation.actor.nodeId,
          operationType,
          resourceType,
          resourceId,
        }
      );
    }

    // Agent-specific authorization checks
    if (actorNode.kind === 'agent') {
      await this.checkAgentAuthorization(operation, actorNode);
    }

    // Additional authorization checks based on operation type
    // For now, subject nodes have full access to their own node's resources
    // Future: integrate with AccessChecker for more granular checks
  }

  /**
   * Check agent-specific authorization constraints.
   */
  private async checkAgentAuthorization(
    operation: PrismOperation,
    agentNode: Node
  ): Promise<void> {
    const { operationType, resourceType, resourceId } = getOperationMetadata(operation);

    // Get agent delegation
    const delegation = await this.repos.nodes.getAgentDelegation(agentNode.id);
    if (!delegation) {
      throw new PrismAuthorizationError(
        `Agent ${agentNode.id} has no delegation`,
        {
          actorNodeId: agentNode.id,
          operationType,
          resourceType,
          resourceId,
        }
      );
    }

    // Check expiration
    if (delegation.constraints?.expiresAt) {
      if (new Date(delegation.constraints.expiresAt) < new Date()) {
        throw new PrismAuthorizationError(
          'Agent delegation has expired',
          {
            actorNodeId: agentNode.id,
            operationType,
            resourceType,
            resourceId,
          }
        );
      }
    }

    // For action approval/rejection, check risk level constraints
    if (
      operation.type === 'approve_action_run' ||
      operation.type === 'reject_action_run'
    ) {
      const actionOp = operation as ApproveActionRunOperation | RejectActionRunOperation;
      const actionRun = await this.repos.actionRuns.get(actionOp.actionRunId);
      if (actionRun) {
        // Check maxRiskLevel constraint
        if (delegation.constraints?.maxRiskLevel) {
          const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
          const maxAllowed = riskOrder[delegation.constraints.maxRiskLevel];
          const required = riskOrder[actionRun.riskLevel];
          if (required > maxAllowed) {
            throw new PrismAuthorizationError(
              `Agent cannot approve ${actionRun.riskLevel} risk actions (max: ${delegation.constraints.maxRiskLevel})`,
              {
                actorNodeId: agentNode.id,
                operationType,
                resourceType,
                resourceId,
              }
            );
          }
        }
      }
    }
  }

  /**
   * Execute the operation using the provided repositories.
   */
  private async executeOperation(
    operation: PrismOperation,
    repos: RepositoryContext
  ): Promise<unknown> {
    switch (operation.type) {
      // Artifact operations
      case 'create_artifact':
        return this.executeCreateArtifact(operation, repos);
      case 'update_artifact':
        return this.executeUpdateArtifact(operation, repos);
      case 'update_artifact_status':
        return this.executeUpdateArtifactStatus(operation, repos);
      case 'delete_artifact':
        return this.executeDeleteArtifact(operation, repos);

      // Episode operations
      case 'create_episode':
        return this.executeCreateEpisode(operation, repos);
      case 'update_episode':
        return this.executeUpdateEpisode(operation, repos);
      case 'update_episode_status':
        return this.executeUpdateEpisodeStatus(operation, repos);

      // Variable operations
      case 'create_variable':
        return this.executeCreateVariable(operation, repos);
      case 'update_variable':
        return this.executeUpdateVariable(operation, repos);
      case 'delete_variable':
        return this.executeDeleteVariable(operation, repos);

      // ActionRun operations
      case 'approve_action_run':
        return this.executeApproveActionRun(operation, repos);
      case 'reject_action_run':
        return this.executeRejectActionRun(operation, repos);
      case 'execute_action_run':
        return this.executeExecuteActionRun(operation, repos);

      // Surface operations
      case 'create_surface':
        return this.executeCreateSurface(operation, repos);
      case 'update_surface':
        return this.executeUpdateSurface(operation, repos);
      case 'delete_surface':
        return this.executeDeleteSurface(operation, repos);

      // Entity operations
      case 'create_entity':
        return this.executeCreateEntity(operation, repos);
      case 'append_entity_event':
        return this.executeAppendEntityEvent(operation, repos);

      // Node operations
      case 'create_node':
        return this.executeCreateNode(operation, repos);
      case 'update_node':
        return this.executeUpdateNode(operation, repos);
      case 'add_edge':
        return this.executeAddEdge(operation, repos);
      case 'remove_edge':
        return this.executeRemoveEdge(operation, repos);
      case 'set_agent_delegation':
        return this.executeSetAgentDelegation(operation, repos);

      // Grant operations
      case 'create_grant':
        return this.executeCreateGrant(operation, repos);
      case 'revoke_grant':
        return this.executeRevokeGrant(operation, repos);

      // Policy operations
      case 'create_policy':
        return this.executeCreatePolicy(operation, repos);
      case 'update_policy':
        return this.executeUpdatePolicy(operation, repos);
      case 'delete_policy':
        return this.executeDeletePolicy(operation, repos);

      default:
        throw new PrismOperationError(
          `Unknown operation type: ${(operation as PrismOperation).type}`,
          {
            operationType: (operation as PrismOperation).type as PrismOperationType,
            resourceType: 'artifact',
          }
        );
    }
  }

  // --- Artifact Operation Handlers ---

  private async executeCreateArtifact(
    operation: CreateArtifactOperation,
    repos: RepositoryContext
  ): Promise<{ artifact: unknown }> {
    const artifact = await repos.artifacts.create(
      {
        id: operation.artifact.id,
        nodeId: operation.nodeId,
        title: operation.artifact.title,
        about: operation.artifact.about,
        notes: operation.artifact.notes,
        page: operation.artifact.page,
        status: operation.artifact.status ?? 'draft',
        entityRefs: operation.artifact.entityRefs,
      },
      {
        authorNodeId: operation.actor.nodeId,
        message: operation.revision?.message,
      }
    );
    return { artifact };
  }

  private async executeUpdateArtifact(
    operation: UpdateArtifactOperation,
    repos: RepositoryContext
  ): Promise<{ artifact: unknown }> {
    const artifact = await repos.artifacts.update(
      operation.artifactId,
      operation.updates,
      {
        authorNodeId: operation.actor.nodeId,
        message: operation.revision?.message,
      }
    );
    if (!artifact) {
      throw new PrismOperationError(`Artifact not found: ${operation.artifactId}`, {
        operationType: 'update_artifact',
        resourceType: 'artifact',
        resourceId: operation.artifactId,
      });
    }
    return { artifact };
  }

  private async executeUpdateArtifactStatus(
    operation: UpdateArtifactStatusOperation,
    repos: RepositoryContext
  ): Promise<{ artifact: unknown }> {
    const artifact = await repos.artifacts.updateStatus(
      operation.artifactId,
      operation.status,
      operation.actor.nodeId
    );
    if (!artifact) {
      throw new PrismOperationError(`Artifact not found: ${operation.artifactId}`, {
        operationType: 'update_artifact_status',
        resourceType: 'artifact',
        resourceId: operation.artifactId,
      });
    }
    return { artifact };
  }

  private async executeDeleteArtifact(
    operation: DeleteArtifactOperation,
    repos: RepositoryContext
  ): Promise<{ deleted: boolean }> {
    // ArtifactRepository doesn't have delete - archive the artifact instead
    const artifact = await repos.artifacts.updateStatus(
      operation.artifactId,
      'archived',
      operation.actor.nodeId
    );
    return { deleted: artifact !== null };
  }

  // --- Episode Operation Handlers ---

  private async executeCreateEpisode(
    operation: CreateEpisodeOperation,
    repos: RepositoryContext
  ): Promise<{ episode: unknown }> {
    const episode = await repos.episodes.create({
      id: operation.episode.id,
      nodeId: operation.nodeId,
      title: operation.episode.title,
      description: operation.episode.description,
      kind: operation.episode.kind,
      variables: operation.episode.variables,
      startsAt: operation.episode.startsAt,
      endsAt: operation.episode.endsAt,
      relatedArtifactIds: operation.episode.relatedArtifactIds,
    });
    return { episode };
  }

  private async executeUpdateEpisode(
    operation: UpdateEpisodeOperation,
    repos: RepositoryContext
  ): Promise<{ episode: unknown }> {
    const episode = await repos.episodes.update(operation.episodeId, operation.updates);
    if (!episode) {
      throw new PrismOperationError(`Episode not found: ${operation.episodeId}`, {
        operationType: 'update_episode',
        resourceType: 'episode',
        resourceId: operation.episodeId,
      });
    }
    return { episode };
  }

  private async executeUpdateEpisodeStatus(
    operation: UpdateEpisodeStatusOperation,
    repos: RepositoryContext
  ): Promise<{ episode: unknown }> {
    const episode = await repos.episodes.updateStatus(operation.episodeId, operation.status);
    if (!episode) {
      throw new PrismOperationError(`Episode not found: ${operation.episodeId}`, {
        operationType: 'update_episode_status',
        resourceType: 'episode',
        resourceId: operation.episodeId,
      });
    }
    return { episode };
  }

  // --- Variable Operation Handlers ---

  private async executeCreateVariable(
    operation: CreateVariableOperation,
    repos: RepositoryContext
  ): Promise<{ variable: unknown }> {
    const variable = await repos.variables.create({
      id: operation.variable.id,
      nodeId: operation.nodeId,
      key: operation.variable.key,
      title: operation.variable.title,
      description: operation.variable.description,
      kind: operation.variable.kind,
      unit: operation.variable.unit,
      viableRange: operation.variable.viableRange,
      preferredRange: operation.variable.preferredRange,
      computeSpecs: operation.variable.computeSpecs ?? [],
    });
    return { variable };
  }

  private async executeUpdateVariable(
    operation: UpdateVariableOperation,
    repos: RepositoryContext
  ): Promise<{ variable: unknown }> {
    const variable = await repos.variables.update(operation.variableId, operation.updates);
    if (!variable) {
      throw new PrismOperationError(`Variable not found: ${operation.variableId}`, {
        operationType: 'update_variable',
        resourceType: 'variable',
        resourceId: operation.variableId,
      });
    }
    return { variable };
  }

  private async executeDeleteVariable(
    operation: DeleteVariableOperation,
    repos: RepositoryContext
  ): Promise<{ deleted: boolean }> {
    // VariableRepository doesn't have delete - check if variable exists
    // In the future, we could soft-delete by clearing computeSpecs or marking as inactive
    const variable = await repos.variables.get(operation.variableId);
    if (!variable) {
      return { deleted: false };
    }
    // Note: Full delete not supported by repository
    // For now, return true if the variable exists (soft delete semantics)
    throw new PrismOperationError(
      'Variable deletion is not supported. Consider removing compute specs instead.',
      {
        operationType: 'delete_variable',
        resourceType: 'variable',
        resourceId: operation.variableId,
      }
    );
  }

  // --- ActionRun Operation Handlers ---

  private async executeApproveActionRun(
    operation: ApproveActionRunOperation,
    repos: RepositoryContext
  ): Promise<{ actionRun: unknown }> {
    const actionRun = await repos.actionRuns.approve(operation.actionRunId, {
      approvedBy: operation.actor.nodeId,
      approvedAt: new Date().toISOString(),
      method: operation.method,
    });
    if (!actionRun) {
      throw new PrismOperationError(`ActionRun not found: ${operation.actionRunId}`, {
        operationType: 'approve_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      });
    }
    return { actionRun };
  }

  private async executeRejectActionRun(
    operation: RejectActionRunOperation,
    repos: RepositoryContext
  ): Promise<{ actionRun: unknown }> {
    const actionRun = await repos.actionRuns.reject(operation.actionRunId, {
      rejectedBy: operation.actor.nodeId,
      reason: operation.reason,
    });
    if (!actionRun) {
      throw new PrismOperationError(`ActionRun not found: ${operation.actionRunId}`, {
        operationType: 'reject_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      });
    }
    return { actionRun };
  }

  private async executeExecuteActionRun(
    operation: ExecuteActionRunOperation,
    repos: RepositoryContext
  ): Promise<{ actionRun: unknown; result?: unknown; durationMs: number }> {
    const actionRun = await repos.actionRuns.get(operation.actionRunId);
    if (!actionRun) {
      throw new PrismOperationError(`ActionRun not found: ${operation.actionRunId}`, {
        operationType: 'execute_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      });
    }

    if (actionRun.status !== 'approved') {
      throw new PrismOperationError(
        `ActionRun ${operation.actionRunId} is not approved (status: ${actionRun.status})`,
        {
          operationType: 'execute_action_run',
          resourceType: 'action_run',
          resourceId: operation.actionRunId,
        }
      );
    }

    const startedAt = new Date().toISOString();
    const startTime = performance.now();

    // Get action handler
    const handler = this.actionRegistry?.getHandler(actionRun.action.actionType);
    const timeoutMs = operation.timeoutMs ?? this.config.defaultActionTimeoutMs;

    if (!handler) {
      const errorMsg = `No handler registered for action type: ${actionRun.action.actionType}`;
      const completedAt = new Date().toISOString();
      const failed = await repos.actionRuns.markFailed(operation.actionRunId, {
        startedAt,
        completedAt,
        error: errorMsg,
      });
      return {
        actionRun: failed || actionRun,
        durationMs: performance.now() - startTime,
      };
    }

    // Get node for context
    const node = await repos.nodes.get(actionRun.nodeId);
    if (!node) {
      throw new PrismOperationError(`Node not found for ActionRun: ${actionRun.nodeId}`, {
        operationType: 'execute_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      });
    }

    try {
      // Execute with timeout
      const resultPromise = handler(actionRun.action.params, {
        actionRun,
        repos,
        node,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Action execution timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const completedAt = new Date().toISOString();

      const executed = await repos.actionRuns.markExecuted(operation.actionRunId, {
        startedAt,
        completedAt,
        result,
      });

      return {
        actionRun: executed || actionRun,
        result,
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorMsg = error instanceof Error ? error.message : String(error);

      const failed = await repos.actionRuns.markFailed(operation.actionRunId, {
        startedAt,
        completedAt,
        error: errorMsg,
      });

      return {
        actionRun: failed || actionRun,
        durationMs: performance.now() - startTime,
      };
    }
  }

  // --- Surface Operation Handlers ---

  private async executeCreateSurface(
    operation: CreateSurfaceOperation,
    repos: RepositoryContext
  ): Promise<{ surface: unknown }> {
    const surface = await repos.surfaces.create({
      id: operation.surface.id,
      nodeId: operation.nodeId,
      kind: operation.surface.kind,
      title: operation.surface.title,
      visibility: operation.surface.visibility,
      entry: operation.surface.entry ?? {},
      layoutId: operation.surface.layoutId,
      inlineLayout: operation.surface.inlineLayout,
    });
    return { surface };
  }

  private async executeUpdateSurface(
    operation: UpdateSurfaceOperation,
    repos: RepositoryContext
  ): Promise<{ surface: unknown }> {
    const surface = await repos.surfaces.update(operation.surfaceId, operation.updates);
    if (!surface) {
      throw new PrismOperationError(`Surface not found: ${operation.surfaceId}`, {
        operationType: 'update_surface',
        resourceType: 'surface',
        resourceId: operation.surfaceId,
      });
    }
    return { surface };
  }

  private async executeDeleteSurface(
    operation: DeleteSurfaceOperation,
    repos: RepositoryContext
  ): Promise<{ deleted: boolean }> {
    const deleted = await repos.surfaces.delete(operation.surfaceId);
    return { deleted };
  }

  // --- Entity Operation Handlers ---

  private async executeCreateEntity(
    operation: CreateEntityOperation,
    repos: RepositoryContext
  ): Promise<{ entity: unknown }> {
    const entity = await repos.entities.create(
      {
        id: operation.entity.id,
        nodeId: operation.nodeId,
        typeId: operation.entity.typeId,
        initialState: operation.entity.initialState,
      },
      operation.actor.nodeId
    );
    return { entity };
  }

  private async executeAppendEntityEvent(
    operation: AppendEntityEventOperation,
    repos: RepositoryContext
  ): Promise<{ entity: unknown }> {
    const entity = await repos.entities.appendEvent(operation.entityId, {
      type: operation.event.type,
      data: operation.event.data,
      actorNodeId: operation.actor.nodeId,
      timestamp: operation.event.timestamp,
    });
    if (!entity) {
      throw new PrismOperationError(`Entity not found: ${operation.entityId}`, {
        operationType: 'append_entity_event',
        resourceType: 'entity',
        resourceId: operation.entityId,
      });
    }
    return { entity };
  }

  // --- Node Operation Handlers ---

  private async executeCreateNode(
    operation: CreateNodeOperation,
    repos: RepositoryContext
  ): Promise<{ node: unknown }> {
    const node = await repos.nodes.create({
      id: operation.node.id,
      kind: operation.node.kind,
      name: operation.node.name,
    });
    return { node };
  }

  private async executeUpdateNode(
    operation: UpdateNodeOperation,
    repos: RepositoryContext
  ): Promise<{ node: unknown }> {
    const node = await repos.nodes.update(operation.nodeId, operation.updates);
    if (!node) {
      throw new PrismOperationError(`Node not found: ${operation.nodeId}`, {
        operationType: 'update_node',
        resourceType: 'node',
        resourceId: operation.nodeId,
      });
    }
    return { node };
  }

  private async executeAddEdge(
    operation: AddEdgeOperation,
    repos: RepositoryContext
  ): Promise<{ edge: unknown }> {
    const edge = await repos.nodes.addEdge({
      fromNodeId: operation.fromNodeId,
      toNodeId: operation.toNodeId,
      type: operation.edgeType,
      metadata: operation.metadata,
    });
    return { edge };
  }

  private async executeRemoveEdge(
    operation: RemoveEdgeOperation,
    repos: RepositoryContext
  ): Promise<{ removed: boolean }> {
    // Find the edge to get its ID
    const edges = await repos.nodes.getEdges(operation.fromNodeId);
    const edge = edges.find(
      (e) =>
        e.fromNodeId === operation.fromNodeId &&
        e.toNodeId === operation.toNodeId &&
        e.type === operation.edgeType
    );
    if (!edge) {
      return { removed: false };
    }
    const removed = await repos.nodes.removeEdge(edge.id);
    return { removed };
  }

  private async executeSetAgentDelegation(
    operation: SetAgentDelegationOperation,
    repos: RepositoryContext
  ): Promise<{ delegation: unknown }> {
    const delegation = {
      ...operation.delegation,
      agentNodeId: operation.agentNodeId,
      grantedAt: new Date().toISOString(),
    };
    await repos.nodes.setAgentDelegation(delegation);
    return { delegation };
  }

  // --- Grant Operation Handlers ---

  private async executeCreateGrant(
    operation: CreateGrantOperation,
    repos: RepositoryContext
  ): Promise<{ grant: unknown }> {
    const grant = await repos.grants.create({
      id: operation.grant.id,
      granteeNodeId: operation.grant.granteeNodeId,
      resourceType: operation.grant.resourceType as 'node' | 'artifact' | 'surface' | 'entity' | 'variable' | 'episode',
      resourceId: operation.grant.resourceId,
      scopes: operation.grant.scopes,
      grantorNodeId: operation.actor.nodeId,
      expiresAt: operation.grant.expiresAt,
    });
    return { grant };
  }

  private async executeRevokeGrant(
    operation: RevokeGrantOperation,
    repos: RepositoryContext
  ): Promise<{ revoked: boolean; grant?: unknown }> {
    const grant = await repos.grants.revoke(operation.grantId, {
      revokedBy: operation.actor.nodeId,
      reason: operation.reason,
    });
    return { revoked: grant !== null, grant };
  }

  // --- Policy Operation Handlers ---

  private async executeCreatePolicy(
    operation: CreatePolicyOperation,
    repos: RepositoryContext
  ): Promise<{ policy: unknown }> {
    // Convert trigger to triggers array
    const triggers: string[] = [];
    if (operation.policy.trigger.observationType) {
      triggers.push(operation.policy.trigger.observationType);
    }
    if (operation.policy.trigger.observationTypePrefix) {
      triggers.push(`${operation.policy.trigger.observationTypePrefix}*`);
    }

    const policy = await repos.policies.create({
      id: operation.policy.id,
      nodeId: operation.nodeId,
      name: operation.policy.name,
      description: operation.policy.description,
      priority: operation.policy.priority,
      enabled: operation.policy.enabled,
      triggers,
      implementation: {
        kind: 'typescript',
        code: operation.policy.evaluatorCode,
      },
    });
    return { policy };
  }

  private async executeUpdatePolicy(
    operation: UpdatePolicyOperation,
    repos: RepositoryContext
  ): Promise<{ policy: unknown }> {
    // Convert operation updates to repository format
    const updates: {
      name?: string;
      description?: string;
      priority?: number;
      enabled?: boolean;
      triggers?: string[];
      implementation?: { kind: 'typescript'; code: string };
    } = {
      name: operation.updates.name,
      description: operation.updates.description,
      priority: operation.updates.priority,
      enabled: operation.updates.enabled,
    };

    // Convert trigger to triggers array if provided
    if (operation.updates.trigger) {
      const triggers: string[] = [];
      if (operation.updates.trigger.observationType) {
        triggers.push(operation.updates.trigger.observationType);
      }
      if (operation.updates.trigger.observationTypePrefix) {
        triggers.push(`${operation.updates.trigger.observationTypePrefix}*`);
      }
      updates.triggers = triggers;
    }

    // Convert evaluatorCode to implementation if provided
    if (operation.updates.evaluatorCode) {
      updates.implementation = {
        kind: 'typescript',
        code: operation.updates.evaluatorCode,
      };
    }

    const policy = await repos.policies.update(operation.policyId, updates);
    if (!policy) {
      throw new PrismOperationError(`Policy not found: ${operation.policyId}`, {
        operationType: 'update_policy',
        resourceType: 'policy',
        resourceId: operation.policyId,
      });
    }
    return { policy };
  }

  private async executeDeletePolicy(
    operation: DeletePolicyOperation,
    repos: RepositoryContext
  ): Promise<{ deleted: boolean }> {
    // PolicyRepository doesn't have delete - disable the policy instead
    const policy = await repos.policies.setEnabled(operation.policyId, false);
    return { deleted: policy !== null };
  }
}

/**
 * Create a new Prism instance.
 */
export function createPrism(options: PrismOptions): Prism {
  return new Prism(options);
}

// --- Helper Functions ---

/**
 * Get metadata about an operation for audit purposes.
 */
function getOperationMetadata(operation: PrismOperation): {
  operationType: PrismOperationType;
  resourceType: PrismResourceType;
  resourceId?: Id;
} {
  switch (operation.type) {
    case 'create_artifact':
      return {
        operationType: 'create_artifact',
        resourceType: 'artifact',
        resourceId: operation.artifact.id,
      };
    case 'update_artifact':
      return {
        operationType: 'update_artifact',
        resourceType: 'artifact',
        resourceId: operation.artifactId,
      };
    case 'update_artifact_status':
      return {
        operationType: 'update_artifact_status',
        resourceType: 'artifact',
        resourceId: operation.artifactId,
      };
    case 'delete_artifact':
      return {
        operationType: 'delete_artifact',
        resourceType: 'artifact',
        resourceId: operation.artifactId,
      };
    case 'create_episode':
      return {
        operationType: 'create_episode',
        resourceType: 'episode',
        resourceId: operation.episode.id,
      };
    case 'update_episode':
      return {
        operationType: 'update_episode',
        resourceType: 'episode',
        resourceId: operation.episodeId,
      };
    case 'update_episode_status':
      return {
        operationType: 'update_episode_status',
        resourceType: 'episode',
        resourceId: operation.episodeId,
      };
    case 'create_variable':
      return {
        operationType: 'create_variable',
        resourceType: 'variable',
        resourceId: operation.variable.id,
      };
    case 'update_variable':
      return {
        operationType: 'update_variable',
        resourceType: 'variable',
        resourceId: operation.variableId,
      };
    case 'delete_variable':
      return {
        operationType: 'delete_variable',
        resourceType: 'variable',
        resourceId: operation.variableId,
      };
    case 'approve_action_run':
      return {
        operationType: 'approve_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      };
    case 'reject_action_run':
      return {
        operationType: 'reject_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      };
    case 'execute_action_run':
      return {
        operationType: 'execute_action_run',
        resourceType: 'action_run',
        resourceId: operation.actionRunId,
      };
    case 'create_surface':
      return {
        operationType: 'create_surface',
        resourceType: 'surface',
        resourceId: operation.surface.id,
      };
    case 'update_surface':
      return {
        operationType: 'update_surface',
        resourceType: 'surface',
        resourceId: operation.surfaceId,
      };
    case 'delete_surface':
      return {
        operationType: 'delete_surface',
        resourceType: 'surface',
        resourceId: operation.surfaceId,
      };
    case 'create_entity':
      return {
        operationType: 'create_entity',
        resourceType: 'entity',
        resourceId: operation.entity.id,
      };
    case 'append_entity_event':
      return {
        operationType: 'append_entity_event',
        resourceType: 'entity',
        resourceId: operation.entityId,
      };
    case 'create_node':
      return {
        operationType: 'create_node',
        resourceType: 'node',
        resourceId: operation.node.id,
      };
    case 'update_node':
      return {
        operationType: 'update_node',
        resourceType: 'node',
        resourceId: operation.nodeId,
      };
    case 'add_edge':
      return {
        operationType: 'add_edge',
        resourceType: 'edge',
        resourceId: `${operation.fromNodeId}:${operation.edgeType}:${operation.toNodeId}`,
      };
    case 'remove_edge':
      return {
        operationType: 'remove_edge',
        resourceType: 'edge',
        resourceId: `${operation.fromNodeId}:${operation.edgeType}:${operation.toNodeId}`,
      };
    case 'set_agent_delegation':
      return {
        operationType: 'set_agent_delegation',
        resourceType: 'node',
        resourceId: operation.agentNodeId,
      };
    case 'create_grant':
      return {
        operationType: 'create_grant',
        resourceType: 'grant',
        resourceId: operation.grant.id,
      };
    case 'revoke_grant':
      return {
        operationType: 'revoke_grant',
        resourceType: 'grant',
        resourceId: operation.grantId,
      };
    case 'create_policy':
      return {
        operationType: 'create_policy',
        resourceType: 'policy',
        resourceId: operation.policy.id,
      };
    case 'update_policy':
      return {
        operationType: 'update_policy',
        resourceType: 'policy',
        resourceId: operation.policyId,
      };
    case 'delete_policy':
      return {
        operationType: 'delete_policy',
        resourceType: 'policy',
        resourceId: operation.policyId,
      };
    default:
      return {
        operationType: (operation as PrismOperation).type as PrismOperationType,
        resourceType: 'artifact',
      };
  }
}

/**
 * Get the node ID for an operation.
 */
function getOperationNodeId(operation: PrismOperation): Id | undefined {
  switch (operation.type) {
    case 'create_artifact':
    case 'create_episode':
    case 'create_variable':
    case 'create_surface':
    case 'create_entity':
    case 'create_policy':
      return operation.nodeId;
    default:
      return undefined;
  }
}

/**
 * Sanitize a result for audit storage (remove large/sensitive data).
 */
function sanitizeForAudit(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  if (typeof result !== 'object') {
    return result;
  }

  // For objects, create a shallow summary
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null && 'id' in value) {
      // For entities with IDs, just store the ID
      sanitized[key] = { id: (value as { id: unknown }).id };
    } else if (typeof value === 'string' && value.length > 1000) {
      // Truncate long strings
      sanitized[key] = value.substring(0, 1000) + '...(truncated)';
    } else if (Array.isArray(value)) {
      // For arrays, just store the length
      sanitized[key] = `[Array(${value.length})]`;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// --- Validation Functions ---

function validateCreateArtifact(operation: CreateArtifactOperation): void {
  if (!operation.nodeId) {
    throw new PrismValidationError('nodeId is required', { field: 'nodeId' });
  }
  if (!operation.artifact?.title) {
    throw new PrismValidationError('artifact.title is required', {
      field: 'artifact.title',
    });
  }
  if (!operation.artifact?.about) {
    throw new PrismValidationError('artifact.about is required', {
      field: 'artifact.about',
    });
  }
  if (!operation.artifact?.page) {
    throw new PrismValidationError('artifact.page is required', {
      field: 'artifact.page',
    });
  }
}

function validateUpdateArtifact(operation: UpdateArtifactOperation): void {
  if (!operation.artifactId) {
    throw new PrismValidationError('artifactId is required', {
      field: 'artifactId',
    });
  }
}

function validateCreateEpisode(operation: CreateEpisodeOperation): void {
  if (!operation.nodeId) {
    throw new PrismValidationError('nodeId is required', { field: 'nodeId' });
  }
  if (!operation.episode?.title) {
    throw new PrismValidationError('episode.title is required', {
      field: 'episode.title',
    });
  }
  if (!operation.episode?.kind) {
    throw new PrismValidationError('episode.kind is required', {
      field: 'episode.kind',
    });
  }
}

function validateCreateVariable(operation: CreateVariableOperation): void {
  if (!operation.nodeId) {
    throw new PrismValidationError('nodeId is required', { field: 'nodeId' });
  }
  if (!operation.variable?.key) {
    throw new PrismValidationError('variable.key is required', {
      field: 'variable.key',
    });
  }
  if (!operation.variable?.title) {
    throw new PrismValidationError('variable.title is required', {
      field: 'variable.title',
    });
  }
  if (!operation.variable?.kind) {
    throw new PrismValidationError('variable.kind is required', {
      field: 'variable.kind',
    });
  }
}

function validateActionRunOperation(
  operation: ApproveActionRunOperation | RejectActionRunOperation | ExecuteActionRunOperation
): void {
  if (!operation.actionRunId) {
    throw new PrismValidationError('actionRunId is required', {
      field: 'actionRunId',
    });
  }
  if (operation.type === 'reject_action_run' && !operation.reason) {
    throw new PrismValidationError('reason is required for rejection', {
      field: 'reason',
    });
  }
}
