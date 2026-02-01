// Tests for the runtime loop

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Observation, Node, Policy, ActionRun, Entity } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  processObservation,
  processObservations,
  isProcessingError,
  type ProcessObservationResult,
} from './loop.js';
import { silentLogger } from './effects/index.js';
import { clearCompiledPolicyCache } from './policies/index.js';

// Clear compiled policy cache before each test to avoid caching issues
beforeEach(() => {
  clearCompiledPolicyCache();
});

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

function createMockObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    nodeId: 'node-1',
    type: 'health.sleep',
    timestamp: '2024-01-15T08:00:00Z',
    payload: { hours: 7.5 },
    provenance: {
      sourceId: 'node-1',
      method: 'manual_entry',
    },
    tags: [],
    ...overrides,
  };
}

function createMockPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    nodeId: 'node-1',
    name: 'Test Policy',
    priority: 100,
    enabled: true,
    triggers: ['health.*'],
    implementation: {
      kind: 'typescript',
      code: 'return [{ effect: "log", level: "info", message: "Policy triggered" }];',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockEntity(id: string): Entity {
  return {
    id,
    nodeId: 'node-1',
    typeId: 'type-1',
    state: { title: 'Test Entity' },
    events: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockActionRun(id: string): ActionRun {
  return {
    id,
    nodeId: 'node-1',
    proposedBy: {
      policyId: 'policy-1',
      observationId: 'obs-1',
    },
    action: {
      actionType: 'test_action',
      params: {},
    },
    riskLevel: 'low',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

let observationIdCounter = 0;

function createMockRepos(overrides: Partial<RepositoryContext> = {}): RepositoryContext {
  const mockNode = createMockNode('node-1');
  observationIdCounter = 0;

  return {
    nodes: {
      get: vi.fn().mockResolvedValue(mockNode),
      getEdges: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      addEdge: vi.fn(),
      removeEdge: vi.fn(),
      setAgentDelegation: vi.fn(),
      getAgentDelegation: vi.fn(),
      revokeAgentDelegation: vi.fn(),
    },
    observations: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockObservation({ id }))),
      append: vi.fn().mockImplementation((input) => {
        observationIdCounter++;
        return Promise.resolve({
          ...createMockObservation(),
          id: `obs-${observationIdCounter}`,
          ...input,
        });
      }),
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
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockEntity(id))),
      create: vi.fn(),
      query: vi.fn(),
      appendEvent: vi.fn().mockImplementation((entityId) =>
        Promise.resolve(createMockEntity(entityId))
      ),
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
      get: vi.fn(),
      create: vi.fn().mockImplementation(() =>
        Promise.resolve(createMockActionRun('action-' + Date.now()))
      ),
      query: vi.fn(),
      getPending: vi.fn(),
      getPendingApproval: vi.fn(),
      approve: vi.fn().mockImplementation((id) =>
        Promise.resolve({ ...createMockActionRun(id), status: 'approved' })
      ),
      reject: vi.fn(),
      markExecuted: vi.fn(),
      markFailed: vi.fn(),
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

// --- Basic Loop Tests ---

describe('processObservation', () => {
  it('processes observation through full loop', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    // Observation was ingested
    expect(result.observation).toBeDefined();
    expect(result.observation.type).toBe('health.sleep');

    // Policy was evaluated
    expect(result.evaluation.policiesEvaluated).toBe(1);
    expect(result.evaluation.totalEffects).toBe(1);

    // Effects were executed
    expect(result.execution.totalExecuted).toBe(1);
    expect(result.execution.successCount).toBe(1);
    expect(result.execution.skipped).toBe(false);

    // Timing info present
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles no matching policies gracefully', async () => {
    const repos = createMockRepos();
    // No policies match
    (repos.policies.getByTrigger as any).mockResolvedValue([]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.observation).toBeDefined();
    expect(result.evaluation.policiesEvaluated).toBe(0);
    expect(result.evaluation.totalEffects).toBe(0);
    expect(result.execution.totalExecuted).toBe(0);
  });

  it('evaluates multiple policies in priority order', async () => {
    const repos = createMockRepos();
    const policyHigh = createMockPolicy({
      id: 'policy-high',
      name: 'High Priority',
      priority: 10,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "High" }];',
      },
    });
    const policyLow = createMockPolicy({
      id: 'policy-low',
      name: 'Low Priority',
      priority: 100,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "Low" }];',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policyLow, policyHigh]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.evaluation.policiesEvaluated).toBe(2);
    expect(result.evaluation.totalEffects).toBe(2);

    // Check policies were evaluated in priority order
    expect(result.evaluation.policyResults[0].policy.id).toBe('policy-high');
    expect(result.evaluation.policyResults[1].policy.id).toBe('policy-low');
  });

  it('handles suppress effect correctly', async () => {
    const repos = createMockRepos();
    const policySuppress = createMockPolicy({
      id: 'policy-suppress',
      priority: 10,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "Before" }, { effect: "suppress", reason: "Not relevant" }];',
      },
    });
    const policyAfter = createMockPolicy({
      id: 'policy-after',
      priority: 100,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "Should not run" }];',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policySuppress, policyAfter]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.evaluation.suppressed).toBe(true);
    expect(result.evaluation.suppressReason).toBe('Not relevant');
    expect(result.evaluation.suppressedByPolicyId).toBe('policy-suppress');

    // Only the first policy was evaluated
    expect(result.evaluation.policyResults).toHaveLength(1);

    // Effects from the suppressing policy still executed (the log before suppress)
    expect(result.execution.totalExecuted).toBe(1);
  });

  it('can skip effect execution for evaluation-only mode', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger, skipExecution: true }
    );

    expect(result.evaluation.policiesEvaluated).toBe(1);
    expect(result.evaluation.totalEffects).toBe(1);
    expect(result.execution.skipped).toBe(true);
    expect(result.execution.totalExecuted).toBe(0);
  });

  it('tracks per-policy execution summaries', async () => {
    const repos = createMockRepos();
    const policy1 = createMockPolicy({
      id: 'policy-1',
      name: 'Policy One',
      priority: 10,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "One" }];',
      },
    });
    const policy2 = createMockPolicy({
      id: 'policy-2',
      name: 'Policy Two',
      priority: 20,
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: "Two-A" }, { effect: "log", level: "info", message: "Two-B" }];',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy1, policy2]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.execution.perPolicy).toHaveLength(2);

    const summary1 = result.execution.perPolicy.find((s) => s.policyId === 'policy-1');
    expect(summary1?.effectsProduced).toBe(1);
    expect(summary1?.effectsExecuted).toBe(1);
    expect(summary1?.effectsSucceeded).toBe(1);

    const summary2 = result.execution.perPolicy.find((s) => s.policyId === 'policy-2');
    expect(summary2?.effectsProduced).toBe(2);
    expect(summary2?.effectsExecuted).toBe(2);
    expect(summary2?.effectsSucceeded).toBe(2);
  });

  it('handles policy that produces no effects', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: 'return [];', // No effects
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.evaluation.policiesEvaluated).toBe(1);
    expect(result.evaluation.totalEffects).toBe(0);
    expect(result.execution.totalExecuted).toBe(0);

    const summary = result.execution.perPolicy[0];
    expect(summary.effectsProduced).toBe(0);
    expect(summary.effectsExecuted).toBe(0);
  });

  it('handles policy execution errors gracefully', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: 'throw new Error("Policy error");',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    // Policy was evaluated but produced no effects due to error
    expect(result.evaluation.policiesEvaluated).toBe(1);
    expect(result.evaluation.totalEffects).toBe(0);
    expect(result.evaluation.policyResults[0].error).toBeDefined();

    // Per-policy summary records the error
    const summary = result.execution.perPolicy[0];
    expect(summary.error).toContain('Policy error');
  });

  it('handles effect execution errors gracefully', async () => {
    const repos = createMockRepos();
    // Make entity lookup fail so create_entity_event fails
    (repos.entities.get as any).mockResolvedValue(null);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [
          { effect: "log", level: "info", message: "Before" },
          { effect: "create_entity_event", entityId: "nonexistent", event: { type: "test", data: {} } },
          { effect: "log", level: "info", message: "After" }
        ];`,
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger }
    );

    expect(result.evaluation.totalEffects).toBe(3);
    expect(result.execution.totalExecuted).toBe(3);
    expect(result.execution.successCount).toBe(2);
    expect(result.execution.failureCount).toBe(1);
  });

  it('can stop on effect error when configured', async () => {
    const repos = createMockRepos();
    (repos.entities.get as any).mockResolvedValue(null);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [
          { effect: "log", level: "info", message: "Before" },
          { effect: "create_entity_event", entityId: "nonexistent", event: { type: "test", data: {} } },
          { effect: "log", level: "info", message: "After" }
        ];`,
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'node-1', method: 'manual_entry' },
      },
      { logger: silentLogger, continueOnError: false }
    );

    // Stopped after the failing effect
    expect(result.execution.totalExecuted).toBe(2);
    expect(result.execution.successCount).toBe(1);
    expect(result.execution.failureCount).toBe(1);
  });

  it('throws on invalid observation input', async () => {
    const repos = createMockRepos();

    await expect(
      processObservation(repos, {
        nodeId: 'node-1',
        type: 'INVALID..TYPE', // Invalid type format
        payload: {},
        provenance: { sourceId: 'node-1' },
      })
    ).rejects.toThrow();
  });

  it('throws when node not found', async () => {
    const repos = createMockRepos();
    (repos.nodes.get as any).mockResolvedValue(null);

    await expect(
      processObservation(repos, {
        nodeId: 'nonexistent',
        type: 'health.sleep',
        payload: {},
        provenance: { sourceId: 'nonexistent' },
      })
    ).rejects.toThrow('Node not found');
  });

  it('can skip node validation for trusted batch imports', async () => {
    const repos = createMockRepos();
    (repos.nodes.get as any).mockResolvedValue(null); // Would fail if validated

    const result = await processObservation(
      repos,
      {
        nodeId: 'node-1',
        type: 'health.sleep',
        payload: {},
        provenance: { sourceId: 'node-1' },
      },
      { validateNode: false, validateSource: false, logger: silentLogger }
    );

    expect(result.observation).toBeDefined();
  });
});

// --- Batch Processing Tests ---

describe('processObservations', () => {
  it('processes multiple observations', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const results = await processObservations(
      repos,
      [
        {
          nodeId: 'node-1',
          type: 'health.sleep',
          payload: { hours: 7 },
          provenance: { sourceId: 'node-1' },
        },
        {
          nodeId: 'node-1',
          type: 'health.sleep',
          payload: { hours: 8 },
          provenance: { sourceId: 'node-1' },
        },
      ],
      { logger: silentLogger }
    );

    expect(results).toHaveLength(2);
    expect(isProcessingError(results[0])).toBe(false);
    expect(isProcessingError(results[1])).toBe(false);

    // Each observation gets a unique ID
    const obs1 = (results[0] as ProcessObservationResult).observation;
    const obs2 = (results[1] as ProcessObservationResult).observation;
    expect(obs1.id).not.toBe(obs2.id);
  });

  it('continues processing after individual errors', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const results = await processObservations(
      repos,
      [
        {
          nodeId: 'node-1',
          type: 'health.sleep',
          payload: { hours: 7 },
          provenance: { sourceId: 'node-1' },
        },
        {
          nodeId: 'node-1',
          type: 'INVALID..TYPE', // Will fail
          payload: {},
          provenance: { sourceId: 'node-1' },
        },
        {
          nodeId: 'node-1',
          type: 'health.sleep',
          payload: { hours: 8 },
          provenance: { sourceId: 'node-1' },
        },
      ],
      { logger: silentLogger }
    );

    expect(results).toHaveLength(3);
    expect(isProcessingError(results[0])).toBe(false);
    expect(isProcessingError(results[1])).toBe(true);
    expect(isProcessingError(results[2])).toBe(false);

    // Check the error result
    const errorResult = results[1] as { error: Error; input: any };
    expect(errorResult.error).toBeDefined();
    expect(errorResult.input.type).toBe('INVALID..TYPE');
  });

  it('handles empty input array', async () => {
    const repos = createMockRepos();

    const results = await processObservations(repos, [], { logger: silentLogger });

    expect(results).toHaveLength(0);
  });
});

// --- Helper Function Tests ---

describe('isProcessingError', () => {
  it('identifies error results', () => {
    const errorResult = { error: new Error('test'), input: {} as any };
    expect(isProcessingError(errorResult)).toBe(true);
  });

  it('identifies success results', () => {
    const successResult = {
      observation: createMockObservation(),
      evaluation: {} as any,
      execution: {} as any,
      totalDurationMs: 0,
    };
    expect(isProcessingError(successResult)).toBe(false);
  });
});
