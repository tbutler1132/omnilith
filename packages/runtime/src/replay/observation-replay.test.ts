// Tests for observation log replay

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Observation, Node, Policy, ActionRun, Entity } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  replayObservation,
  replayObservationLog,
  groupActionRunsByObservation,
  isReplayError,
} from './observation-replay.js';
import { clearCompiledPolicyCache } from '../policies/index.js';

// Clear compiled policy cache before each test
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

function createMockActionRun(id: string, observationId: string): ActionRun {
  return {
    id,
    nodeId: 'node-1',
    proposedBy: {
      policyId: 'policy-1',
      observationId,
    },
    action: {
      actionType: 'test_action',
      params: {},
    },
    riskLevel: 'low',
    status: 'executed',
    approval: {
      approvedBy: 'node-1',
      approvedAt: '2024-01-15T08:01:00Z',
      method: 'auto',
    },
    execution: {
      startedAt: '2024-01-15T08:01:00Z',
      completedAt: '2024-01-15T08:01:01Z',
      result: { success: true },
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
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

function createMockRepos(overrides: Partial<RepositoryContext> = {}): RepositoryContext {
  const mockNode = createMockNode('node-1');

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
      append: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockObservation(), ...input })
      ),
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
      getByNode: vi.fn().mockResolvedValue([]),
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
        Promise.resolve(createMockActionRun('action-' + Date.now(), 'obs-1'))
      ),
      query: vi.fn(),
      getPending: vi.fn(),
      getPendingApproval: vi.fn(),
      approve: vi.fn(),
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

// --- Replay Observation Tests ---

describe('replayObservation', () => {
  it('replays an observation and evaluates policies', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observation = createMockObservation();
    const result = await replayObservation(repos, observation);

    expect(result.observation).toEqual(observation);
    expect(result.evaluation.policyResults).toHaveLength(1);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].effect).toBe('log');
    expect(result.executedEffects).toHaveLength(0); // Default mode is evaluate_only
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('uses historical ActionRuns instead of creating new ones', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "propose_action", action: { actionType: "test", params: {} } }];',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observation = createMockObservation();
    const historicalRun = createMockActionRun('historical-action-1', observation.id);
    const historicalActionRuns = new Map([[observation.id, [historicalRun]]]);

    const result = await replayObservation(repos, observation, {
      mode: 'execute_internal',
      historicalActionRuns,
    });

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].effect).toBe('propose_action');
    expect(result.skippedEffects).toHaveLength(1);
    expect(result.usedHistoricalActionRuns).toHaveLength(1);
    expect(result.usedHistoricalActionRuns[0]).toEqual(historicalRun);

    // ActionRun.create should NOT have been called
    expect(repos.actionRuns.create).not.toHaveBeenCalled();
  });

  it('uses fixed timestamp for deterministic replay', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: 'return [{ effect: "log", level: "info", message: ctx.evaluatedAt }];',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observation = createMockObservation();
    const result = await replayObservation(repos, observation, {
      evaluatedAt: '2024-01-15T00:00:00Z',
    });

    expect(result.effects).toHaveLength(1);
    expect((result.effects[0] as any).message).toBe('2024-01-15T00:00:00Z');
  });

  it('handles no matching policies', async () => {
    const repos = createMockRepos();
    (repos.policies.getByTrigger as any).mockResolvedValue([]);

    const observation = createMockObservation();
    const result = await replayObservation(repos, observation);

    expect(result.effects).toHaveLength(0);
    expect(result.evaluation.policyResults).toHaveLength(0);
  });

  it('handles policy errors gracefully', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: 'throw new Error("Policy error");',
      },
    });
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observation = createMockObservation();
    const result = await replayObservation(repos, observation);

    expect(result.evaluation.policyResults).toHaveLength(1);
    expect(result.evaluation.policyResults[0].error).toBeDefined();
    expect(result.effects).toHaveLength(0);
  });
});

// --- Replay Log Tests ---

describe('replayObservationLog', () => {
  it('replays multiple observations in order', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observations = [
      createMockObservation({ id: 'obs-1', timestamp: '2024-01-15T08:00:00Z' }),
      createMockObservation({ id: 'obs-2', timestamp: '2024-01-15T09:00:00Z' }),
      createMockObservation({ id: 'obs-3', timestamp: '2024-01-15T10:00:00Z' }),
    ];

    const result = await replayObservationLog(repos, observations);

    expect(result.totalObservations).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(0);
    expect(result.totalEffects).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it('continues on error when configured', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any)
      .mockResolvedValueOnce([policy])
      .mockRejectedValueOnce(new Error('Database error'))
      .mockResolvedValueOnce([policy]);

    const observations = [
      createMockObservation({ id: 'obs-1' }),
      createMockObservation({ id: 'obs-2' }),
      createMockObservation({ id: 'obs-3' }),
    ];

    const result = await replayObservationLog(repos, observations, {
      continueOnError: true,
    });

    expect(result.totalObservations).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(isReplayError(result.results[1])).toBe(true);
  });

  it('stops on error when configured', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any)
      .mockResolvedValueOnce([policy])
      .mockRejectedValueOnce(new Error('Database error'))
      .mockResolvedValueOnce([policy]);

    const observations = [
      createMockObservation({ id: 'obs-1' }),
      createMockObservation({ id: 'obs-2' }),
      createMockObservation({ id: 'obs-3' }),
    ];

    const result = await replayObservationLog(repos, observations, {
      continueOnError: false,
    });

    expect(result.totalObservations).toBe(3);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.results).toHaveLength(2); // Stopped after error
  });

  it('respects limit option', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy();
    (repos.policies.getByTrigger as any).mockResolvedValue([policy]);

    const observations = [
      createMockObservation({ id: 'obs-1' }),
      createMockObservation({ id: 'obs-2' }),
      createMockObservation({ id: 'obs-3' }),
      createMockObservation({ id: 'obs-4' }),
      createMockObservation({ id: 'obs-5' }),
    ];

    const result = await replayObservationLog(repos, observations, {
      limit: 2,
    });

    expect(result.totalObservations).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it('calls progress callback', async () => {
    const repos = createMockRepos();
    (repos.policies.getByTrigger as any).mockResolvedValue([]);

    const observations = [
      createMockObservation({ id: 'obs-1' }),
      createMockObservation({ id: 'obs-2' }),
      createMockObservation({ id: 'obs-3' }),
    ];

    const progressCalls: [number, number][] = [];
    await replayObservationLog(repos, observations, {
      onProgress: (current, total) => progressCalls.push([current, total]),
    });

    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('handles empty observation list', async () => {
    const repos = createMockRepos();

    const result = await replayObservationLog(repos, []);

    expect(result.totalObservations).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

// --- Helper Function Tests ---

describe('groupActionRunsByObservation', () => {
  it('groups action runs by observation ID', () => {
    const runs = [
      createMockActionRun('action-1', 'obs-1'),
      createMockActionRun('action-2', 'obs-1'),
      createMockActionRun('action-3', 'obs-2'),
      createMockActionRun('action-4', 'obs-3'),
    ];

    const map = groupActionRunsByObservation(runs);

    expect(map.size).toBe(3);
    expect(map.get('obs-1')).toHaveLength(2);
    expect(map.get('obs-2')).toHaveLength(1);
    expect(map.get('obs-3')).toHaveLength(1);
  });

  it('handles empty array', () => {
    const map = groupActionRunsByObservation([]);
    expect(map.size).toBe(0);
  });
});

describe('isReplayError', () => {
  it('identifies error results', () => {
    const errorResult = { error: new Error('test'), observation: createMockObservation() };
    expect(isReplayError(errorResult)).toBe(true);
  });

  it('identifies success results', () => {
    const successResult = {
      observation: createMockObservation(),
      evaluation: {} as any,
      effects: [],
      executedEffects: [],
      skippedEffects: [],
      usedHistoricalActionRuns: [],
      durationMs: 0,
    };
    expect(isReplayError(successResult)).toBe(false);
  });
});
