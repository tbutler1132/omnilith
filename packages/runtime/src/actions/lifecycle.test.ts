// Tests for ActionRun Lifecycle (Phase 3.1)

import { describe, it, expect, vi } from 'vitest';
import type { ActionRun, Node, ActionDefinition, AgentDelegation } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  createActionRun,
  approveActionRun,
  rejectActionRun,
  executeActionRun,
  getPendingApprovals,
  getActionRunsByStatus,
  createActionRegistry,
  compareRiskLevels,
  requiresManualApproval,
  ActionRunNotFoundError,
  InvalidActionStateError,
  InsufficientAuthorityError,
} from './lifecycle.js';
import { ValidationError, NodeNotFoundError } from '../errors.js';

// --- Test Fixtures ---

function createMockNode(id: string, kind: 'subject' | 'object' | 'agent' = 'subject'): Node {
  return {
    id,
    kind,
    name: `Test Node ${id}`,
    edges: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockActionRun(
  id: string,
  overrides: Partial<ActionRun> = {}
): ActionRun {
  return {
    id,
    nodeId: 'node-1',
    proposedBy: {
      policyId: 'policy-1',
      observationId: 'obs-1',
    },
    action: {
      actionType: 'test_action',
      params: { key: 'value' },
    },
    riskLevel: 'medium',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockRepos(overrides: Partial<RepositoryContext> = {}): RepositoryContext {
  const mockNode = createMockNode('node-1');
  let actionRunCounter = 0;

  return {
    nodes: {
      get: vi.fn().mockImplementation((id) => {
        if (id === 'node-1') return Promise.resolve(mockNode);
        if (id === 'approver-node') return Promise.resolve(createMockNode('approver-node', 'subject'));
        if (id === 'agent-node') return Promise.resolve(createMockNode('agent-node', 'agent'));
        if (id === 'object-node') return Promise.resolve(createMockNode('object-node', 'object'));
        return Promise.resolve(null);
      }),
      getEdges: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      addEdge: vi.fn(),
      removeEdge: vi.fn(),
      setAgentDelegation: vi.fn(),
      getAgentDelegation: vi.fn().mockResolvedValue(null),
      revokeAgentDelegation: vi.fn(),
    },
    observations: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      append: vi.fn(),
      count: vi.fn(),
      getByType: vi.fn(),
      getRecent: vi.fn(),
      stream: vi.fn(),
    },
    artifacts: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      list: vi.fn(),
      query: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      getRevisions: vi.fn(),
      getRevision: vi.fn(),
      getByEntityRef: vi.fn(),
    },
    entities: {
      get: vi.fn(),
      create: vi.fn(),
      query: vi.fn(),
      appendEvent: vi.fn(),
      getEvents: vi.fn(),
      queryEvents: vi.fn(),
      materializeState: vi.fn(),
      createType: vi.fn(),
      getType: vi.fn(),
      getTypeByName: vi.fn(),
      listTypes: vi.fn(),
    },
    variables: {
      get: vi.fn().mockResolvedValue(null),
      getByKey: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      addComputeSpec: vi.fn(),
      updateComputeSpec: vi.fn(),
      removeComputeSpec: vi.fn(),
      getByNode: vi.fn(),
    },
    episodes: {
      getActive: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      getByVariable: vi.fn(),
      getByArtifact: vi.fn(),
    },
    grants: {
      getForGrantee: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      query: vi.fn(),
      revoke: vi.fn(),
      hasAccess: vi.fn(),
      getForResource: vi.fn(),
      getByGrantor: vi.fn(),
      getGrantedScopes: vi.fn(),
    },
    policies: {
      getByTrigger: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getByNode: vi.fn(),
      setEnabled: vi.fn(),
    },
    actionRuns: {
      get: vi.fn().mockImplementation((id) =>
        Promise.resolve(createMockActionRun(id))
      ),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockActionRun(`action-${++actionRunCounter}`, {
          nodeId: input.nodeId,
          proposedBy: input.proposedBy,
          action: input.action,
          riskLevel: input.riskLevel,
          status: 'pending',
        }))
      ),
      query: vi.fn().mockResolvedValue([]),
      getPending: vi.fn().mockResolvedValue([]),
      getPendingApproval: vi.fn().mockResolvedValue([]),
      approve: vi.fn().mockImplementation((id, approval) =>
        Promise.resolve(createMockActionRun(id, {
          status: 'approved',
          approval,
        }))
      ),
      reject: vi.fn().mockImplementation((id, rejection) =>
        Promise.resolve(createMockActionRun(id, {
          status: 'rejected',
          rejection: {
            rejectedBy: rejection.rejectedBy,
            rejectedAt: new Date().toISOString(),
            reason: rejection.reason,
          },
        }))
      ),
      markExecuted: vi.fn().mockImplementation((id, execution) =>
        Promise.resolve(createMockActionRun(id, {
          status: 'executed',
          execution,
        }))
      ),
      markFailed: vi.fn().mockImplementation((id, execution) =>
        Promise.resolve(createMockActionRun(id, {
          status: 'failed',
          execution,
        }))
      ),
      countByStatus: vi.fn(),
    },
    surfaces: {
      get: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getByNode: vi.fn(),
      updateLayout: vi.fn(),
    },
    ...overrides,
  } as unknown as RepositoryContext;
}

// --- Utility Function Tests ---

describe('compareRiskLevels', () => {
  it('compares risk levels correctly', () => {
    expect(compareRiskLevels('low', 'low')).toBe(0);
    expect(compareRiskLevels('low', 'medium')).toBeLessThan(0);
    expect(compareRiskLevels('medium', 'low')).toBeGreaterThan(0);
    expect(compareRiskLevels('low', 'critical')).toBeLessThan(0);
    expect(compareRiskLevels('critical', 'low')).toBeGreaterThan(0);
    expect(compareRiskLevels('high', 'critical')).toBeLessThan(0);
  });
});

describe('requiresManualApproval', () => {
  it('returns false for low risk', () => {
    expect(requiresManualApproval('low')).toBe(false);
  });

  it('returns true for medium, high, and critical', () => {
    expect(requiresManualApproval('medium')).toBe(true);
    expect(requiresManualApproval('high')).toBe(true);
    expect(requiresManualApproval('critical')).toBe(true);
  });
});

// --- ActionRegistry Tests ---

describe('createActionRegistry', () => {
  it('registers and retrieves action definitions', () => {
    const registry = createActionRegistry();
    const definition: ActionDefinition = {
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    };
    const handler = vi.fn();

    registry.register(definition, handler);

    expect(registry.has('test_action')).toBe(true);
    expect(registry.get('test_action')).toEqual(definition);
    expect(registry.getHandler('test_action')).toBe(handler);
  });

  it('prevents duplicate registration', () => {
    const registry = createActionRegistry();
    const definition: ActionDefinition = {
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    };

    registry.register(definition, vi.fn());

    expect(() => registry.register(definition, vi.fn())).toThrow('already registered');
  });

  it('allows unregistering actions', () => {
    const registry = createActionRegistry();
    const definition: ActionDefinition = {
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    };

    registry.register(definition, vi.fn());
    expect(registry.has('test_action')).toBe(true);

    registry.unregister('test_action');
    expect(registry.has('test_action')).toBe(false);
    expect(registry.get('test_action')).toBeUndefined();
  });
});

// --- createActionRun Tests ---

describe('createActionRun', () => {
  it('creates an ActionRun with valid input', async () => {
    const repos = createMockRepos();

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'send_email',
        params: { to: 'test@example.com' },
      },
    });

    expect(result.actionRun).toBeDefined();
    expect(result.actionRun.nodeId).toBe('node-1');
    expect(result.actionRun.action.actionType).toBe('send_email');
    expect(repos.actionRuns.create).toHaveBeenCalled();
  });

  it('auto-approves low-risk actions by default', async () => {
    const repos = createMockRepos();

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'log_entry',
        params: {},
      },
      riskLevel: 'low',
    });

    expect(result.autoApproved).toBe(true);
    expect(repos.actionRuns.approve).toHaveBeenCalled();
  });

  it('does not auto-approve when disabled', async () => {
    const repos = createMockRepos();

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'log_entry',
        params: {},
      },
      riskLevel: 'low',
    }, {
      autoApproveLowRisk: false,
    });

    expect(result.autoApproved).toBe(false);
    expect(repos.actionRuns.approve).not.toHaveBeenCalled();
  });

  it('does not auto-approve medium-risk actions', async () => {
    const repos = createMockRepos();

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'external_api',
        params: {},
      },
      riskLevel: 'medium',
    });

    expect(result.autoApproved).toBe(false);
  });

  it('uses action registry for risk level resolution', async () => {
    const repos = createMockRepos();
    const registry = createActionRegistry();

    registry.register({
      actionType: 'defined_action',
      name: 'Defined Action',
      riskLevel: 'high',
    }, vi.fn());

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'defined_action',
        params: {},
      },
    }, {
      actionRegistry: registry,
    });

    expect(result.actionRun.riskLevel).toBe('high');
    expect(result.autoApproved).toBe(false);
  });

  it('explicit risk level overrides action definition', async () => {
    const repos = createMockRepos();
    const registry = createActionRegistry();

    registry.register({
      actionType: 'defined_action',
      name: 'Defined Action',
      riskLevel: 'low',
    }, vi.fn());

    const result = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'defined_action',
        params: {},
      },
      riskLevel: 'high', // Override the low risk from definition
    }, {
      actionRegistry: registry,
    });

    expect(result.actionRun.riskLevel).toBe('high');
  });

  it('throws ValidationError for missing nodeId', async () => {
    const repos = createMockRepos();

    await expect(
      createActionRun(repos, {
        nodeId: '',
        proposedBy: {
          policyId: 'policy-1',
          observationId: 'obs-1',
        },
        action: {
          actionType: 'test',
          params: {},
        },
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing action', async () => {
    const repos = createMockRepos();

    await expect(
      createActionRun(repos, {
        nodeId: 'node-1',
        proposedBy: {
          policyId: 'policy-1',
          observationId: 'obs-1',
        },
        action: null as any,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws NodeNotFoundError for nonexistent node', async () => {
    const repos = createMockRepos();
    (repos.nodes.get as any).mockResolvedValue(null);

    await expect(
      createActionRun(repos, {
        nodeId: 'nonexistent',
        proposedBy: {
          policyId: 'policy-1',
          observationId: 'obs-1',
        },
        action: {
          actionType: 'test',
          params: {},
        },
      })
    ).rejects.toThrow(NodeNotFoundError);
  });

  it('skips node validation when disabled', async () => {
    const repos = createMockRepos();
    (repos.nodes.get as any).mockResolvedValue(null);

    // Should not throw even though node doesn't exist
    const result = await createActionRun(repos, {
      nodeId: 'nonexistent',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'test',
        params: {},
      },
    }, {
      validateNode: false,
    });

    expect(result.actionRun).toBeDefined();
  });
});

// --- approveActionRun Tests ---

describe('approveActionRun', () => {
  it('approves a pending ActionRun', async () => {
    const repos = createMockRepos();

    const result = await approveActionRun(repos, {
      actionRunId: 'action-1',
      approverNodeId: 'node-1',
      method: 'manual',
    });

    expect(result.status).toBe('approved');
    expect(result.approval).toBeDefined();
    expect(result.approval?.method).toBe('manual');
    expect(repos.actionRuns.approve).toHaveBeenCalled();
  });

  it('allows auto approval method', async () => {
    const repos = createMockRepos();

    const result = await approveActionRun(repos, {
      actionRunId: 'action-1',
      approverNodeId: 'node-1',
      method: 'auto',
    });

    expect(result.approval?.method).toBe('auto');
  });

  it('throws ActionRunNotFoundError for nonexistent ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(null);

    await expect(
      approveActionRun(repos, {
        actionRunId: 'nonexistent',
        approverNodeId: 'node-1',
        method: 'manual',
      })
    ).rejects.toThrow(ActionRunNotFoundError);
  });

  it('throws InvalidActionStateError for non-pending ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'approved' })
    );

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'node-1',
        method: 'manual',
      })
    ).rejects.toThrow(InvalidActionStateError);
  });

  it('throws NodeNotFoundError for nonexistent approver', async () => {
    const repos = createMockRepos();

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'nonexistent',
        method: 'manual',
      })
    ).rejects.toThrow(NodeNotFoundError);
  });

  it('throws ValidationError for invalid method', async () => {
    const repos = createMockRepos();

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'node-1',
        method: 'invalid' as any,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('allows subject node to approve actions', async () => {
    const repos = createMockRepos();

    // Should not throw
    const result = await approveActionRun(repos, {
      actionRunId: 'action-1',
      approverNodeId: 'approver-node',
      method: 'manual',
    });

    expect(result.status).toBe('approved');
  });

  it('prevents agent from approving high-risk actions', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { riskLevel: 'high' })
    );

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'agent-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });

  it('prevents agent from approving critical-risk actions', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { riskLevel: 'critical' })
    );

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'agent-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });

  it('prevents object node from approving actions', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { riskLevel: 'low' })
    );

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'object-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });

  it('enforces agent delegation maxRiskLevel constraint', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { riskLevel: 'medium' })
    );
    (repos.nodes.getAgentDelegation as any).mockResolvedValue({
      agentNodeId: 'agent-node',
      sponsorNodeId: 'sponsor-node',
      grantedAt: '2024-01-01T00:00:00Z',
      scopes: ['approve_action'],
      constraints: {
        maxRiskLevel: 'low',
      },
    } satisfies AgentDelegation);

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'agent-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });

  it('enforces agent delegation allowedEffects constraint', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', {
        riskLevel: 'low',
        action: { actionType: 'send_email', params: {} },
      })
    );
    (repos.nodes.getAgentDelegation as any).mockResolvedValue({
      agentNodeId: 'agent-node',
      sponsorNodeId: 'sponsor-node',
      grantedAt: '2024-01-01T00:00:00Z',
      scopes: ['approve_action'],
      constraints: {
        allowedEffects: ['create_artifact', 'update_artifact'], // send_email not allowed
      },
    } satisfies AgentDelegation);

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'agent-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });

  it('allows agent when action type is in allowedEffects', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', {
        riskLevel: 'low',
        action: { actionType: 'create_artifact', params: {} },
      })
    );
    (repos.nodes.getAgentDelegation as any).mockResolvedValue({
      agentNodeId: 'agent-node',
      sponsorNodeId: 'sponsor-node',
      grantedAt: '2024-01-01T00:00:00Z',
      scopes: ['approve_action'],
      constraints: {
        allowedEffects: ['create_artifact', 'update_artifact'],
      },
    } satisfies AgentDelegation);

    // Should not throw
    const result = await approveActionRun(repos, {
      actionRunId: 'action-1',
      approverNodeId: 'agent-node',
      method: 'manual',
    });

    expect(result.status).toBe('approved');
  });

  it('enforces agent delegation expiration', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { riskLevel: 'low' })
    );
    (repos.nodes.getAgentDelegation as any).mockResolvedValue({
      agentNodeId: 'agent-node',
      sponsorNodeId: 'sponsor-node',
      grantedAt: '2024-01-01T00:00:00Z',
      scopes: ['approve_action'],
      constraints: {
        expiresAt: '2020-01-01T00:00:00Z', // Expired
      },
    } satisfies AgentDelegation);

    await expect(
      approveActionRun(repos, {
        actionRunId: 'action-1',
        approverNodeId: 'agent-node',
        method: 'manual',
      })
    ).rejects.toThrow(InsufficientAuthorityError);
  });
});

// --- rejectActionRun Tests ---

describe('rejectActionRun', () => {
  it('rejects a pending ActionRun', async () => {
    const repos = createMockRepos();

    const result = await rejectActionRun(repos, {
      actionRunId: 'action-1',
      rejectorNodeId: 'node-1',
      reason: 'Not appropriate at this time',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejection).toBeDefined();
    expect(result.rejection?.reason).toBe('Not appropriate at this time');
    expect(repos.actionRuns.reject).toHaveBeenCalled();
  });

  it('throws ActionRunNotFoundError for nonexistent ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(null);

    await expect(
      rejectActionRun(repos, {
        actionRunId: 'nonexistent',
        rejectorNodeId: 'node-1',
        reason: 'Test',
      })
    ).rejects.toThrow(ActionRunNotFoundError);
  });

  it('throws InvalidActionStateError for non-pending ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'approved' })
    );

    await expect(
      rejectActionRun(repos, {
        actionRunId: 'action-1',
        rejectorNodeId: 'node-1',
        reason: 'Too late',
      })
    ).rejects.toThrow(InvalidActionStateError);
  });

  it('throws ValidationError for empty reason', async () => {
    const repos = createMockRepos();

    await expect(
      rejectActionRun(repos, {
        actionRunId: 'action-1',
        rejectorNodeId: 'node-1',
        reason: '',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for whitespace-only reason', async () => {
    const repos = createMockRepos();

    await expect(
      rejectActionRun(repos, {
        actionRunId: 'action-1',
        rejectorNodeId: 'node-1',
        reason: '   ',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws NodeNotFoundError for nonexistent rejector', async () => {
    const repos = createMockRepos();

    await expect(
      rejectActionRun(repos, {
        actionRunId: 'action-1',
        rejectorNodeId: 'nonexistent',
        reason: 'Test',
      })
    ).rejects.toThrow(NodeNotFoundError);
  });
});

// --- executeActionRun Tests ---

describe('executeActionRun', () => {
  it('executes an approved ActionRun successfully', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'approved' })
    );

    const registry = createActionRegistry();
    registry.register({
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    }, async (params) => {
      return { processed: true, input: params };
    });

    const result = await executeActionRun(repos, {
      actionRunId: 'action-1',
    }, {
      actionRegistry: registry,
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ processed: true, input: { key: 'value' } });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(repos.actionRuns.markExecuted).toHaveBeenCalled();
  });

  it('marks action as failed when handler throws', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'approved' })
    );

    const registry = createActionRegistry();
    registry.register({
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    }, async () => {
      throw new Error('Something went wrong');
    });

    const result = await executeActionRun(repos, {
      actionRunId: 'action-1',
    }, {
      actionRegistry: registry,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
    expect(repos.actionRuns.markFailed).toHaveBeenCalled();
  });

  it('fails when no handler is registered', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', {
        status: 'approved',
        action: { actionType: 'unknown_action', params: {} },
      })
    );

    const registry = createActionRegistry();

    const result = await executeActionRun(repos, {
      actionRunId: 'action-1',
    }, {
      actionRegistry: registry,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler registered');
    expect(repos.actionRuns.markFailed).toHaveBeenCalled();
  });

  it('throws ActionRunNotFoundError for nonexistent ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(null);

    await expect(
      executeActionRun(repos, {
        actionRunId: 'nonexistent',
      })
    ).rejects.toThrow(ActionRunNotFoundError);
  });

  it('throws InvalidActionStateError for non-approved ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'pending' })
    );

    await expect(
      executeActionRun(repos, {
        actionRunId: 'action-1',
      })
    ).rejects.toThrow(InvalidActionStateError);
  });

  it('throws InvalidActionStateError for rejected ActionRun', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'rejected' })
    );

    await expect(
      executeActionRun(repos, {
        actionRunId: 'action-1',
      })
    ).rejects.toThrow(InvalidActionStateError);
  });

  it('times out long-running handlers', async () => {
    const repos = createMockRepos();
    (repos.actionRuns.get as any).mockResolvedValue(
      createMockActionRun('action-1', { status: 'approved' })
    );

    const registry = createActionRegistry();
    registry.register({
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    }, async () => {
      // Simulate long-running operation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { done: true };
    });

    const result = await executeActionRun(repos, {
      actionRunId: 'action-1',
    }, {
      actionRegistry: registry,
      timeoutMs: 50, // Very short timeout
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(repos.actionRuns.markFailed).toHaveBeenCalled();
  });

  it('passes context to handler', async () => {
    const repos = createMockRepos();
    const actionRun = createMockActionRun('action-1', { status: 'approved' });
    (repos.actionRuns.get as any).mockResolvedValue(actionRun);

    const handler = vi.fn().mockResolvedValue({ done: true });

    const registry = createActionRegistry();
    registry.register({
      actionType: 'test_action',
      name: 'Test Action',
      riskLevel: 'low',
    }, handler);

    await executeActionRun(repos, {
      actionRunId: 'action-1',
    }, {
      actionRegistry: registry,
    });

    expect(handler).toHaveBeenCalledWith(
      actionRun.action.params,
      expect.objectContaining({
        actionRun: expect.objectContaining({ id: 'action-1' }),
        repos,
        node: expect.objectContaining({ id: 'node-1' }),
      })
    );
  });
});

// --- Query Function Tests ---

describe('getPendingApprovals', () => {
  it('returns pending ActionRuns needing approval', async () => {
    const repos = createMockRepos();
    const pendingActions = [
      createMockActionRun('action-1', { riskLevel: 'medium' }),
      createMockActionRun('action-2', { riskLevel: 'high' }),
    ];
    (repos.actionRuns.getPendingApproval as any).mockResolvedValue(pendingActions);

    const result = await getPendingApprovals(repos, 'node-1');

    expect(result).toHaveLength(2);
    expect(repos.actionRuns.getPendingApproval).toHaveBeenCalledWith('node-1');
  });
});

describe('getActionRunsByStatus', () => {
  it('queries ActionRuns by status', async () => {
    const repos = createMockRepos();
    const executedActions = [
      createMockActionRun('action-1', { status: 'executed' }),
    ];
    (repos.actionRuns.query as any).mockResolvedValue(executedActions);

    const result = await getActionRunsByStatus(repos, 'node-1', ['executed', 'failed']);

    expect(result).toHaveLength(1);
    expect(repos.actionRuns.query).toHaveBeenCalledWith({
      nodeId: 'node-1',
      status: ['executed', 'failed'],
    });
  });
});

// --- Integration Tests ---

describe('ActionRun full lifecycle', () => {
  it('completes full lifecycle: create → approve → execute', async () => {
    const repos = createMockRepos();

    // Create a registry with a handler
    const registry = createActionRegistry();
    registry.register({
      actionType: 'send_notification',
      name: 'Send Notification',
      riskLevel: 'medium',
    }, async (params) => {
      return { sent: true, to: params.recipient };
    });

    // 1. Create the action
    const createResult = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'send_notification',
        params: { recipient: 'user@example.com', message: 'Hello' },
      },
    }, {
      actionRegistry: registry,
    });

    expect(createResult.actionRun.status).toBe('pending');
    expect(createResult.autoApproved).toBe(false);

    // 2. Approve the action
    // The actionRun from create already has the correct action type
    (repos.actionRuns.get as any).mockResolvedValue(createResult.actionRun);

    const approveResult = await approveActionRun(repos, {
      actionRunId: createResult.actionRun.id,
      approverNodeId: 'node-1',
      method: 'manual',
    });

    expect(approveResult.status).toBe('approved');

    // 3. Execute the action
    // Mock the approved version with the same action details
    const approvedActionRun = {
      ...createResult.actionRun,
      status: 'approved' as const,
      approval: approveResult.approval,
    };
    (repos.actionRuns.get as any).mockResolvedValue(approvedActionRun);

    const executeResult = await executeActionRun(repos, {
      actionRunId: approvedActionRun.id,
    }, {
      actionRegistry: registry,
    });

    expect(executeResult.success).toBe(true);
    expect(executeResult.result).toEqual({
      sent: true,
      to: 'user@example.com',
    });
  });

  it('handles rejection in lifecycle', async () => {
    const repos = createMockRepos();

    // 1. Create the action
    const createResult = await createActionRun(repos, {
      nodeId: 'node-1',
      proposedBy: {
        policyId: 'policy-1',
        observationId: 'obs-1',
      },
      action: {
        actionType: 'risky_action',
        params: {},
      },
      riskLevel: 'high',
    });

    expect(createResult.actionRun.status).toBe('pending');

    // 2. Reject the action
    (repos.actionRuns.get as any).mockResolvedValue(createResult.actionRun);

    const rejectResult = await rejectActionRun(repos, {
      actionRunId: createResult.actionRun.id,
      rejectorNodeId: 'node-1',
      reason: 'Too risky for current context',
    });

    expect(rejectResult.status).toBe('rejected');
    expect(rejectResult.rejection?.reason).toBe('Too risky for current context');

    // 3. Cannot execute a rejected action
    (repos.actionRuns.get as any).mockResolvedValue(rejectResult);

    await expect(
      executeActionRun(repos, {
        actionRunId: rejectResult.id,
      })
    ).rejects.toThrow(InvalidActionStateError);
  });
});
