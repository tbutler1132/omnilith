// Tests for effect execution

import { describe, it, expect, vi } from 'vitest';
import type { Effect, Observation, Node, ActionRun, Entity } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  executeEffect,
  executeEffects,
  registerEffectHandler,
  unregisterEffectHandler,
  hasEffectHandler,
  getRegisteredEffectTypes,
  createExecutionContext,
} from './executor.js';
import { isPackEffect, parsePackEffect, packEffectType } from './registry.js';
import { createCapturingLogger, silentLogger } from './types.js';

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
      get: vi.fn().mockImplementation((id) =>
        Promise.resolve(createMockObservation({ id }))
      ),
      append: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          ...createMockObservation(),
          id: 'new-obs-' + Date.now(),
          ...input,
        })
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

// --- Registry Tests ---

describe('effectRegistry', () => {
  it('has built-in handlers registered', () => {
    expect(hasEffectHandler('route_observation')).toBe(true);
    expect(hasEffectHandler('create_entity_event')).toBe(true);
    expect(hasEffectHandler('propose_action')).toBe(true);
    expect(hasEffectHandler('tag_observation')).toBe(true);
    expect(hasEffectHandler('suppress')).toBe(true);
    expect(hasEffectHandler('log')).toBe(true);
  });

  it('returns all registered types', () => {
    const types = getRegisteredEffectTypes();
    expect(types).toContain('route_observation');
    expect(types).toContain('log');
  });

  it('allows registering custom handlers', () => {
    const customHandler = vi.fn().mockResolvedValue({ custom: true });

    registerEffectHandler('pack:test:custom', customHandler);
    expect(hasEffectHandler('pack:test:custom')).toBe(true);

    // Cleanup
    unregisterEffectHandler('pack:test:custom');
    expect(hasEffectHandler('pack:test:custom')).toBe(false);
  });

  it('prevents duplicate registration', () => {
    const handler = vi.fn();
    registerEffectHandler('pack:test:unique', handler);

    expect(() => registerEffectHandler('pack:test:unique', handler)).toThrow();

    // Cleanup
    unregisterEffectHandler('pack:test:unique');
  });
});

describe('isPackEffect', () => {
  it('identifies pack effects', () => {
    expect(isPackEffect('pack:mypack:action')).toBe(true);
    expect(isPackEffect('pack:a:b')).toBe(true);
  });

  it('rejects non-pack effects', () => {
    expect(isPackEffect('route_observation')).toBe(false);
    expect(isPackEffect('log')).toBe(false);
    expect(isPackEffect('packsomething')).toBe(false);
  });
});

describe('parsePackEffect', () => {
  it('parses valid pack effects', () => {
    expect(parsePackEffect('pack:mypack:action')).toEqual({
      packName: 'mypack',
      actionName: 'action',
    });
  });

  it('returns null for invalid pack effects', () => {
    expect(parsePackEffect('route_observation')).toBeNull();
    expect(parsePackEffect('pack:only-two-parts')).toBeNull();
    expect(parsePackEffect('pack:too:many:parts:here')).toBeNull();
  });
});

describe('packEffectType', () => {
  it('creates pack effect type string', () => {
    expect(packEffectType('mypack', 'action')).toBe('pack:mypack:action');
  });
});

// --- Handler Tests ---

describe('log handler', () => {
  it('logs debug messages', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'log', level: 'debug', message: 'Debug message' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ level: 'debug', message: 'Debug message' });
    expect(logger.entries.some((e) => e.level === 'debug' && e.message === 'Debug message')).toBe(
      true
    );
  });

  it('logs info messages', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'log', level: 'info', message: 'Info message' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(logger.entries.some((e) => e.level === 'info' && e.message === 'Info message')).toBe(
      true
    );
  });

  it('logs warn messages', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'log', level: 'warn', message: 'Warning message' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(logger.entries.some((e) => e.level === 'warn' && e.message === 'Warning message')).toBe(
      true
    );
  });
});

describe('suppress handler', () => {
  it('logs suppression', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'suppress', reason: 'Not relevant' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ reason: 'Not relevant' });
    expect(logger.entries.some((e) => e.message === 'Evaluation suppressed')).toBe(true);
  });
});

describe('route_observation handler', () => {
  it('routes observation to target node', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'route_observation', toNodeId: 'node-2' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.toNodeId).toBe('node-2');
    expect(repos.observations.append).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-2',
        type: observation.type,
        provenance: expect.objectContaining({ method: 'routed' }),
      })
    );
  });

  it('fails if target node does not exist', async () => {
    const repos = createMockRepos();
    (repos.nodes.get as any).mockResolvedValue(null);

    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = { effect: 'route_observation', toNodeId: 'nonexistent' };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target node not found');
  });

  it('adds routed_from tag', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation({ nodeId: 'source-node' });
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = { effect: 'route_observation', toNodeId: 'node-2' };
    await executeEffect(effect, ctx);

    expect(repos.observations.append).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining(['routed_from:source-node']),
      })
    );
  });
});

describe('create_entity_event handler', () => {
  it('appends event to entity', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = {
      effect: 'create_entity_event',
      entityId: 'entity-1',
      event: { type: 'status_changed', data: { status: 'active' } },
    };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ entityId: 'entity-1', eventType: 'status_changed' });
    expect(repos.entities.appendEvent).toHaveBeenCalledWith(
      'entity-1',
      expect.objectContaining({
        type: 'status_changed',
        data: { status: 'active' },
      })
    );
  });

  it('fails if entity does not exist', async () => {
    const repos = createMockRepos();
    (repos.entities.get as any).mockResolvedValue(null);

    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = {
      effect: 'create_entity_event',
      entityId: 'nonexistent',
      event: { type: 'updated', data: {} },
    };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Entity not found');
  });
});

describe('propose_action handler', () => {
  it('creates pending action run', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = {
      effect: 'propose_action',
      action: { actionType: 'send_email', params: { to: 'test@example.com' } },
    };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('pending');
    expect(repos.actionRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: observation.nodeId,
        proposedBy: { policyId: 'policy-1', observationId: observation.id },
        action: effect.action,
      })
    );
  });

  it('auto-approves low risk actions', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = {
      effect: 'propose_action',
      action: {
        actionType: 'log_entry',
        params: { message: 'test', riskLevel: 'low' },
      },
    };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoApproved).toBe(true);
    expect(result.data?.status).toBe('approved');
    expect(repos.actionRuns.approve).toHaveBeenCalled();
  });

  it('does not auto-approve medium risk actions', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = {
      effect: 'propose_action',
      action: {
        actionType: 'external_api_call',
        params: { riskLevel: 'medium' },
      },
    };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoApproved).toBe(false);
    expect(result.data?.status).toBe('pending');
  });
});

describe('tag_observation handler', () => {
  it('adds tags to observation', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation({ tags: ['existing'] });
    (repos.observations.get as any).mockResolvedValue(observation);

    const logger = createCapturingLogger();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger });

    const effect: Effect = { effect: 'tag_observation', tags: ['new-tag', 'another'] };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.tagsAdded).toEqual(['new-tag', 'another']);
    expect(logger.entries.some((e) => e.message === 'Observation tagged')).toBe(true);
  });

  it('skips duplicate tags', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation({ tags: ['existing', 'already-there'] });
    (repos.observations.get as any).mockResolvedValue(observation);

    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = { effect: 'tag_observation', tags: ['existing', 'new-one'] };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.tagsAdded).toEqual(['new-one']);
  });

  it('handles all tags already present', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation({ tags: ['a', 'b'] });
    (repos.observations.get as any).mockResolvedValue(observation);

    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect: Effect = { effect: 'tag_observation', tags: ['a', 'b'] };
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.tagsAdded).toEqual([]);
  });
});

// --- Executor Tests ---

describe('executeEffects', () => {
  it('executes multiple effects', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const effects: Effect[] = [
      { effect: 'log', level: 'info', message: 'First' },
      { effect: 'log', level: 'info', message: 'Second' },
    ];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.results).toHaveLength(2);
  });

  it('continues on error by default', async () => {
    const repos = createMockRepos();
    (repos.entities.get as any).mockResolvedValue(null);

    const observation = createMockObservation();

    const effects: Effect[] = [
      { effect: 'log', level: 'info', message: 'First' },
      { effect: 'create_entity_event', entityId: 'bad', event: { type: 'x', data: {} } },
      { effect: 'log', level: 'info', message: 'Third' },
    ];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.results).toHaveLength(3);
  });

  it('stops on error when configured', async () => {
    const repos = createMockRepos();
    (repos.entities.get as any).mockResolvedValue(null);

    const observation = createMockObservation();

    const effects: Effect[] = [
      { effect: 'log', level: 'info', message: 'First' },
      { effect: 'create_entity_event', entityId: 'bad', event: { type: 'x', data: {} } },
      { effect: 'log', level: 'info', message: 'Third' },
    ];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
      continueOnError: false,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[1].success).toBe(false);
  });

  it('detects suppress effect', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const effects: Effect[] = [
      { effect: 'log', level: 'info', message: 'Before' },
      { effect: 'suppress', reason: 'Testing' },
      { effect: 'log', level: 'info', message: 'After' },
    ];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    expect(result.suppressed).toBe(true);
    expect(result.suppressReason).toBe('Testing');
  });

  it('skips suppress execution by default', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const effects: Effect[] = [{ effect: 'suppress', reason: 'Testing' }];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    // Suppress is skipped, so results should be empty
    expect(result.results).toHaveLength(0);
    expect(result.suppressed).toBe(true);
  });

  it('handles unknown effect types gracefully', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const effects: Effect[] = [{ effect: 'pack:unknown:action' } as Effect];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    expect(result.failureCount).toBe(1);
    expect(result.results[0].error).toContain('Unknown pack effect');
  });

  it('tracks total duration', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const effects: Effect[] = [{ effect: 'log', level: 'info', message: 'Test' }];

    const result = await executeEffects(effects, repos, observation, 'policy-1', {
      logger: silentLogger,
    });

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// --- Custom Handler Tests ---

describe('custom effect handlers', () => {
  it('can register and use custom pack handlers', async () => {
    const customData = { processed: true };
    const customHandler = vi.fn().mockResolvedValue(customData);

    registerEffectHandler('pack:test:process', customHandler);

    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect = { effect: 'pack:test:process', input: 'data' } as Effect;
    const result = await executeEffect(effect, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(customData);
    expect(customHandler).toHaveBeenCalledWith(effect, ctx);

    // Cleanup
    unregisterEffectHandler('pack:test:process');
  });

  it('passes effect and context to handler', async () => {
    const handler = vi.fn().mockResolvedValue({});
    registerEffectHandler('pack:test:context', handler);

    const repos = createMockRepos();
    const observation = createMockObservation();
    const ctx = createExecutionContext(repos, observation, 'policy-1', { logger: silentLogger });

    const effect = { effect: 'pack:test:context', custom: 'value' } as Effect;
    await executeEffect(effect, ctx);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ effect: 'pack:test:context', custom: 'value' }),
      expect.objectContaining({
        repos,
        observation,
        policyId: 'policy-1',
        nodeId: observation.nodeId,
      })
    );

    // Cleanup
    unregisterEffectHandler('pack:test:context');
  });
});
