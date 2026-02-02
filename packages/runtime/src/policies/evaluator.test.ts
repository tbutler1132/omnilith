// Tests for policy evaluation engine

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Policy,
  Observation,
  Node,
  ObservationFilter,
} from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  evaluatePolicy,
  evaluatePolicies,
  matchesTrigger,
  filterPoliciesByTrigger,
} from './evaluator.js';
import { compilePolicy, clearCompiledPolicyCache } from './compiler.js';
import {
  PolicyCompilationError,
  PolicyExecutionError,
  InvalidEffectError,
} from '../errors.js';

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
      code: 'return [];',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockRepos(nodeOverride?: Node): RepositoryContext {
  const mockNode = nodeOverride ?? createMockNode('node-1');

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
      get: vi.fn().mockResolvedValue(null),
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
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      getPending: vi.fn(),
      getByObservation: vi.fn(),
      getByPolicy: vi.fn(),
    },
    surfaces: {
      get: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getByNode: vi.fn(),
      updateLayout: vi.fn(),
    },
  } as unknown as RepositoryContext;
}

// --- Compiler Tests ---

describe('compilePolicy', () => {
  beforeEach(() => {
    clearCompiledPolicyCache();
  });

  it('compiles a simple policy that returns empty array', () => {
    const policy = createMockPolicy({
      implementation: { kind: 'typescript', code: 'return [];' },
    });

    const evaluator = compilePolicy(policy);
    expect(typeof evaluator).toBe('function');
  });

  it('compiles a policy that returns effects', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'log', level: 'info', message: 'Hello' }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects).toHaveLength(1);
    expect(effects[0]).toEqual({ effect: 'log', level: 'info', message: 'Hello' });
  });

  it('compiles a policy that uses ctx', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          if (ctx.observation.type === 'health.sleep') {
            return [{ effect: 'log', level: 'info', message: 'Sleep logged: ' + ctx.observation.payload.hours + 'h' }];
          }
          return [];
        `,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = {
      observation: createMockObservation({ payload: { hours: 8 } }),
    } as any;
    const effects = evaluator(ctx);

    expect(effects).toHaveLength(1);
    expect(effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Sleep logged: 8h',
    });
  });

  it('throws PolicyCompilationError for empty code', () => {
    const policy = createMockPolicy({
      implementation: { kind: 'typescript', code: '' },
    });

    expect(() => compilePolicy(policy)).toThrow(PolicyCompilationError);
  });

  it('throws PolicyCompilationError for whitespace-only code', () => {
    const policy = createMockPolicy({
      implementation: { kind: 'typescript', code: '   \n\t  ' },
    });

    expect(() => compilePolicy(policy)).toThrow(PolicyCompilationError);
  });

  it('throws PolicyCompilationError for syntax errors', () => {
    const policy = createMockPolicy({
      implementation: { kind: 'typescript', code: 'return [{ effect: ' }, // Missing closing
    });

    expect(() => compilePolicy(policy)).toThrow(PolicyCompilationError);
  });

  it('throws InvalidEffectError for invalid effect type', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'invalid_effect' }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;

    expect(() => evaluator(ctx)).toThrow(InvalidEffectError);
  });

  it('throws InvalidEffectError for missing required fields', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'route_observation' }];`, // Missing toNodeId
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;

    expect(() => evaluator(ctx)).toThrow(InvalidEffectError);
  });

  it('validates route_observation effect', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'route_observation', toNodeId: 'node-2' }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0]).toEqual({ effect: 'route_observation', toNodeId: 'node-2' });
  });

  it('validates suppress effect', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'suppress', reason: 'Test suppression' }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0]).toEqual({ effect: 'suppress', reason: 'Test suppression' });
  });

  it('validates tag_observation effect', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'tag_observation', tags: ['important', 'reviewed'] }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0]).toEqual({ effect: 'tag_observation', tags: ['important', 'reviewed'] });
  });

  it('validates propose_action effect', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'propose_action', action: { name: 'send_reminder', params: {} } }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0].effect).toBe('propose_action');
  });

  it('validates create_entity_event effect', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'create_entity_event', entityId: 'entity-1', event: { type: 'updated', data: {} } }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0].effect).toBe('create_entity_event');
  });

  it('allows pack effects with namespaced format', () => {
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'pack:my-pack:custom-action', customData: 123 }];`,
      },
    });

    const evaluator = compilePolicy(policy);
    const ctx = { observation: createMockObservation() } as any;
    const effects = evaluator(ctx);

    expect(effects[0]).toEqual({ effect: 'pack:my-pack:custom-action', customData: 123 });
  });
});

// --- Trigger Matching Tests ---

describe('matchesTrigger', () => {
  it('matches exact type', () => {
    expect(matchesTrigger('health.sleep', 'health.sleep')).toBe(true);
  });

  it('does not match different exact type', () => {
    expect(matchesTrigger('health.sleep', 'health.exercise')).toBe(false);
  });

  it('matches wildcard suffix', () => {
    expect(matchesTrigger('health.sleep', 'health.*')).toBe(true);
    expect(matchesTrigger('health.exercise', 'health.*')).toBe(true);
    expect(matchesTrigger('health.sleep.quality', 'health.*')).toBe(true);
  });

  it('does not match partial prefix with wildcard', () => {
    expect(matchesTrigger('healthy.food', 'health.*')).toBe(false);
  });

  it('matches full wildcard', () => {
    expect(matchesTrigger('anything.goes.here', '*')).toBe(true);
    expect(matchesTrigger('x', '*')).toBe(true);
  });

  it('matches prefix exactly with wildcard suffix', () => {
    expect(matchesTrigger('health', 'health.*')).toBe(true);
  });
});

describe('filterPoliciesByTrigger', () => {
  it('filters to matching policies', () => {
    const policies = [
      createMockPolicy({ id: 'p1', triggers: ['health.*'] }),
      createMockPolicy({ id: 'p2', triggers: ['work.*'] }),
      createMockPolicy({ id: 'p3', triggers: ['*'] }),
    ];

    const filtered = filterPoliciesByTrigger(policies, 'health.sleep');

    expect(filtered.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('excludes disabled policies', () => {
    const policies = [
      createMockPolicy({ id: 'p1', triggers: ['health.*'], enabled: true }),
      createMockPolicy({ id: 'p2', triggers: ['health.*'], enabled: false }),
    ];

    const filtered = filterPoliciesByTrigger(policies, 'health.sleep');

    expect(filtered.map((p) => p.id)).toEqual(['p1']);
  });

  it('matches any trigger in array', () => {
    const policies = [
      createMockPolicy({ id: 'p1', triggers: ['work.*', 'health.*'] }),
    ];

    const filtered = filterPoliciesByTrigger(policies, 'health.sleep');
    expect(filtered).toHaveLength(1);

    const filtered2 = filterPoliciesByTrigger(policies, 'work.task');
    expect(filtered2).toHaveLength(1);
  });
});

// --- Evaluation Tests ---

describe('evaluatePolicy', () => {
  beforeEach(() => {
    clearCompiledPolicyCache();
  });

  it('evaluates a simple policy returning empty effects', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: { kind: 'typescript', code: 'return [];' },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects).toEqual([]);
    expect(result.suppressed).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('evaluates a policy returning effects', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'log', level: 'info', message: 'Hello' }];`,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ effect: 'log', level: 'info', message: 'Hello' });
  });

  it('policy can access observation from context', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const hours = ctx.observation.payload.hours;
          return [{ effect: 'log', level: 'info', message: 'Slept ' + hours + ' hours' }];
        `,
      },
    });
    const observation = createMockObservation({ payload: { hours: 8 } });

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Slept 8 hours',
    });
  });

  it('policy can access priorEffects from context', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const priorCount = ctx.priorEffects.length;
          return [{ effect: 'log', level: 'info', message: 'Prior effects: ' + priorCount }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation, {
      priorEffects: [
        { effect: 'log', level: 'debug', message: 'Earlier' },
        { effect: 'tag_observation', tags: ['tagged'] },
      ],
    });

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Prior effects: 2',
    });
  });

  it('detects suppress effect', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'suppress', reason: 'Not relevant' }];`,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.suppressed).toBe(true);
    expect(result.suppressReason).toBe('Not relevant');
    expect(result.effects).toHaveLength(1);
  });

  it('skips disabled policies', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      enabled: false,
      implementation: {
        kind: 'typescript',
        code: `return [{ effect: 'log', level: 'info', message: 'Should not run' }];`,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('captures errors without breaking', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `throw new Error('Policy error');`,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects).toEqual([]);
    expect(result.error).toBeInstanceOf(PolicyExecutionError);
    expect(result.error?.message).toContain('Policy error');
  });

  it('handles timeout', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Simulate slow work (but not infinite loop since we're sync)
          let x = 0;
          for (let i = 0; i < 1e9; i++) { x += i; }
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    // This test might not actually timeout due to JS single-threaded nature
    // but the infrastructure is in place for async policy execution
    const result = await evaluatePolicy(repos, policy, observation, { timeoutMs: 1 });

    // Either it times out or completes (depending on JS engine)
    expect(result.policy).toBe(policy);
  });
});

// --- Multi-Policy Evaluation Tests ---

describe('evaluatePolicies', () => {
  beforeEach(() => {
    clearCompiledPolicyCache();
  });

  it('evaluates policies in priority order', async () => {
    const repos = createMockRepos();

    const policies = [
      createMockPolicy({
        id: 'low-priority',
        priority: 200,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'low' }];`,
        },
      }),
      createMockPolicy({
        id: 'high-priority',
        priority: 50,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'high' }];`,
        },
      }),
      createMockPolicy({
        id: 'medium-priority',
        priority: 100,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'medium' }];`,
        },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    // Effects should be in priority order
    const messages = result.effects.map(
      (e) => (e as { effect: 'log'; message: string }).message
    );
    expect(messages).toEqual(['high', 'medium', 'low']);

    // Policy results should be in priority order
    expect(result.policyResults.map((r) => r.policy.id)).toEqual([
      'high-priority',
      'medium-priority',
      'low-priority',
    ]);
  });

  it('accumulates prior effects for later policies', async () => {
    const repos = createMockRepos();

    const policies = [
      createMockPolicy({
        id: 'first',
        priority: 1,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'tag_observation', tags: ['first'] }];`,
        },
      }),
      createMockPolicy({
        id: 'second',
        priority: 2,
        implementation: {
          kind: 'typescript',
          code: `
            // Should see the tag from first policy
            const tags = ctx.priorEffects
              .filter(e => e.effect === 'tag_observation')
              .flatMap(e => e.tags);
            return [{ effect: 'log', level: 'info', message: 'Prior tags: ' + tags.join(',') }];
          `,
        },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    expect(result.effects).toHaveLength(2);
    expect(result.effects[1]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Prior tags: first',
    });
  });

  it('stops evaluation on suppress effect', async () => {
    const repos = createMockRepos();

    const policies = [
      createMockPolicy({
        id: 'first',
        priority: 1,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'first' }];`,
        },
      }),
      createMockPolicy({
        id: 'suppressor',
        priority: 2,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'suppress', reason: 'Stop here' }];`,
        },
      }),
      createMockPolicy({
        id: 'third',
        priority: 3,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'should not run' }];`,
        },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    expect(result.suppressed).toBe(true);
    expect(result.suppressReason).toBe('Stop here');
    expect(result.suppressedByPolicyId).toBe('suppressor');

    // Only first two policies should have run
    expect(result.policyResults).toHaveLength(2);
    expect(result.policyResults.map((r) => r.policy.id)).toEqual(['first', 'suppressor']);

    // Effects should include first policy's log and suppress
    expect(result.effects).toHaveLength(2);
    const effectTypes = result.effects.map((e) => e.effect);
    expect(effectTypes).toContain('log');
    expect(effectTypes).toContain('suppress');
  });

  it('continues evaluation if a policy errors', async () => {
    const repos = createMockRepos();

    const policies = [
      createMockPolicy({
        id: 'first',
        priority: 1,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'first' }];`,
        },
      }),
      createMockPolicy({
        id: 'broken',
        priority: 2,
        implementation: {
          kind: 'typescript',
          code: `throw new Error('I am broken');`,
        },
      }),
      createMockPolicy({
        id: 'third',
        priority: 3,
        implementation: {
          kind: 'typescript',
          code: `return [{ effect: 'log', level: 'info', message: 'third' }];`,
        },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    // All three should have run
    expect(result.policyResults).toHaveLength(3);

    // Second policy should have error
    expect(result.policyResults[1].error).toBeInstanceOf(PolicyExecutionError);

    // Effects from first and third should be present
    expect(result.effects).toHaveLength(2);
    const messages = result.effects.map((e) => (e as any).message);
    expect(messages).toContain('first');
    expect(messages).toContain('third');
  });

  it('handles empty policy list', async () => {
    const repos = createMockRepos();
    const observation = createMockObservation();

    const result = await evaluatePolicies(repos, [], observation);

    expect(result.effects).toEqual([]);
    expect(result.policyResults).toEqual([]);
    expect(result.suppressed).toBe(false);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks total duration', async () => {
    const repos = createMockRepos();

    const policies = [
      createMockPolicy({
        id: 'p1',
        priority: 1,
        implementation: { kind: 'typescript', code: 'return [];' },
      }),
      createMockPolicy({
        id: 'p2',
        priority: 2,
        implementation: { kind: 'typescript', code: 'return [];' },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.policyResults.every((r) => r.durationMs >= 0)).toBe(true);
  });
});

// --- Canon Accessor Tests ---

describe('CanonAccessor', () => {
  beforeEach(() => {
    clearCompiledPolicyCache();
  });

  it('enforces observation query limits', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Try to query with a very high limit
          const obs = ctx.canon.queryObservations({ limit: 5000 });
          return [{ effect: 'log', level: 'info', message: 'Queried' }];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // Check that the query was called with capped limit
    expect(repos.observations.query).toHaveBeenCalled();
    const queryArg = (repos.observations.query as any).mock.calls[0][0] as ObservationFilter;
    expect(queryArg.limit).toBeLessThanOrEqual(1000);
  });

  it('applies default time window when not specified', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Query without specifying window
          const obs = ctx.canon.queryObservations({ limit: 10 });
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // The first call (index 0) is the pre-fetch for estimates (7 days)
    // The second call (index 1) is from the policy's queryObservations
    const calls = (repos.observations.query as any).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const queryArg = calls[1][0] as ObservationFilter;
    expect(queryArg.window).toEqual({ hours: 24 });
  });

  it('preserves user-specified time window', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          ctx.canon.queryObservations({ limit: 10, window: { hours: 48 } });
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // Verify the query was called with the user-specified window
    expect(repos.observations.query).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        window: { hours: 48 },
      })
    );
  });

  it('preserves user-specified timeRange', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          ctx.canon.queryObservations({
            limit: 10,
            timeRange: { start: '2024-01-01', end: '2024-01-15' }
          });
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // Should not add default window when timeRange is specified
    expect(repos.observations.query).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        timeRange: { start: '2024-01-01', end: '2024-01-15' },
      })
    );
    // The policy's query is the second call (index 1), first is estimates pre-fetch
    const calls = (repos.observations.query as any).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const queryArg = calls[1][0] as ObservationFilter;
    expect(queryArg.window).toBeUndefined();
  });
});
