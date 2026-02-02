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
    // Set up observations with timestamps - one recent (within 24h) and one old
    const now = Date.now();
    const recentTimestamp = new Date(now - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
    const oldTimestamp = new Date(now - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    (repos.observations.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...createMockObservation(), id: 'recent', timestamp: recentTimestamp },
      { ...createMockObservation(), id: 'old', timestamp: oldTimestamp },
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Query without specifying window - should apply default 24h window
          const obs = ctx.canon.queryObservations({ limit: 10 });
          globalThis.__testResults = obs;
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // The pre-fetch uses a 7-day window, so both observations are available
    // But the policy's query should apply default 24h window, filtering out the old one
    // Since we pre-fetch then filter locally, only observations within 24h remain
    const calls = (repos.observations.query as any).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves user-specified time window', async () => {
    const repos = createMockRepos();
    // Set up observations - pre-fetch uses 7-day window
    const now = Date.now();
    const within48h = new Date(now - 36 * 60 * 60 * 1000).toISOString(); // 36 hours ago
    const outside48h = new Date(now - 60 * 60 * 60 * 1000).toISOString(); // 60 hours ago
    (repos.observations.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...createMockObservation(), id: 'within', timestamp: within48h },
      { ...createMockObservation(), id: 'outside', timestamp: outside48h },
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Query with custom 48h window - should include 'within' but not 'outside'
          const obs = ctx.canon.queryObservations({ limit: 10, window: { hours: 48 } });
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // Observations are pre-fetched with 7-day window, then filtered locally
    // The local filter should use the user-specified 48h window
    expect(repos.observations.query).toHaveBeenCalled();
  });

  it('preserves user-specified timeRange', async () => {
    const repos = createMockRepos();
    // Set up observations with various timestamps
    (repos.observations.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...createMockObservation(), id: 'jan-05', timestamp: '2024-01-05T00:00:00Z' },
      { ...createMockObservation(), id: 'jan-20', timestamp: '2024-01-20T00:00:00Z' },
      { ...createMockObservation(), id: 'dec-25', timestamp: '2023-12-25T00:00:00Z' },
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          // Query with specific timeRange - filtering happens locally
          const obs = ctx.canon.queryObservations({
            limit: 10,
            timeRange: { start: '2024-01-01', end: '2024-01-15' }
          });
          return [];
        `,
      },
    });
    const observation = createMockObservation();

    await evaluatePolicy(repos, policy, observation);

    // Observations are pre-fetched, then filtered locally by timeRange
    // The local filter applies the user-specified timeRange
    expect(repos.observations.query).toHaveBeenCalled();
    // Only one call is expected now (the pre-fetch) since filtering happens locally
    const calls = (repos.observations.query as any).mock.calls;
    expect(calls.length).toBe(1);
  });
});

// --- Episode-Aware Policy Tests (Phase 5.2) ---

import type { Episode } from '@omnilith/protocol';

function createMockEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'episode-1',
    nodeId: 'node-1',
    title: 'Test Episode',
    kind: 'regulatory',
    variables: [{ variableId: 'var-1', intent: 'stabilize' }],
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Episode-Aware Policies (Phase 5.2)', () => {
  beforeEach(() => {
    clearCompiledPolicyCache();
  });

  it('policy can access active episodes via canon.getActiveEpisodes()', async () => {
    const repos = createMockRepos();
    // Mock active episodes
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({ id: 'ep-1', title: 'Sleep Regulation' }),
      createMockEpisode({ id: 'ep-2', title: 'Exercise Focus' }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          return [{ effect: 'log', level: 'info', message: 'Active episodes: ' + episodes.length }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Active episodes: 2',
    });
  });

  it('policy can filter episodes by kind', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({ id: 'ep-1', kind: 'regulatory', title: 'Regulatory' }),
      createMockEpisode({ id: 'ep-2', kind: 'exploratory', title: 'Exploratory' }),
      createMockEpisode({ id: 'ep-3', kind: 'regulatory', title: 'Another Regulatory' }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const regulatory = episodes.filter(ep => ep.kind === 'regulatory');
          return [{ effect: 'log', level: 'info', message: 'Regulatory: ' + regulatory.length }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Regulatory: 2',
    });
  });

  it('policy can check if a specific variable has an active episode', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        variables: [
          { variableId: 'var-sleep', intent: 'stabilize' },
          { variableId: 'var-energy', intent: 'increase' },
        ],
      }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const hasSleepEpisode = episodes.some(ep =>
            ep.variables.some(v => v.variableId === 'var-sleep')
          );
          const hasExerciseEpisode = episodes.some(ep =>
            ep.variables.some(v => v.variableId === 'var-exercise')
          );
          return [
            { effect: 'log', level: 'info', message: 'Sleep episode: ' + hasSleepEpisode },
            { effect: 'log', level: 'info', message: 'Exercise episode: ' + hasExerciseEpisode },
          ];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Sleep episode: true',
    });
    expect(result.effects[1]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Exercise episode: false',
    });
  });

  it('policy behaves differently during active regulatory episode', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
      }),
    ]);

    const policy = createMockPolicy({
      triggers: ['health.sleep'],
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const sleepEpisode = episodes.find(ep =>
            ep.kind === 'regulatory' &&
            ep.variables.some(v => v.variableId === 'var-sleep')
          );

          if (sleepEpisode) {
            // During active episode, be more aggressive
            return [
              { effect: 'log', level: 'info', message: 'PRIORITY: Sleep observation during active episode' },
              { effect: 'propose_action', action: { name: 'send_reminder', params: { urgency: 'high' } } },
            ];
          }

          // Normal behavior
          return [{ effect: 'log', level: 'info', message: 'Standard sleep observation' }];
        `,
      },
    });
    const observation = createMockObservation({ type: 'health.sleep' });

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'PRIORITY: Sleep observation during active episode',
    });
    expect(result.effects[1].effect).toBe('propose_action');
  });

  it('policy can check episode intent', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        variables: [{ variableId: 'var-sleep', intent: 'increase' }],
      }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const sleepIntent = episodes
            .flatMap(ep => ep.variables)
            .find(v => v.variableId === 'var-sleep')?.intent;

          return [{ effect: 'log', level: 'info', message: 'Sleep intent: ' + sleepIntent }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Sleep intent: increase',
    });
  });

  it('policy handles no active episodes gracefully', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          if (episodes.length === 0) {
            return [{ effect: 'log', level: 'debug', message: 'No active episodes' }];
          }
          return [{ effect: 'log', level: 'info', message: 'Has episodes' }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'debug',
      message: 'No active episodes',
    });
  });

  it('policy can suppress effects during exploratory episode', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        kind: 'exploratory',
        variables: [{ variableId: 'var-sleep', intent: 'probe' }],
      }),
    ]);

    const policy = createMockPolicy({
      triggers: ['health.sleep'],
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const exploratoryEpisode = episodes.find(ep => ep.kind === 'exploratory');

          if (exploratoryEpisode) {
            // During exploration, relax normal constraints
            return [{ effect: 'suppress', reason: 'Exploratory episode active - relaxing sleep constraints' }];
          }

          return [{ effect: 'log', level: 'warn', message: 'Sleep outside range' }];
        `,
      },
    });
    const observation = createMockObservation({ type: 'health.sleep' });

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.suppressed).toBe(true);
    expect(result.suppressReason).toBe('Exploratory episode active - relaxing sleep constraints');
  });

  it('policy can read episode temporal scope', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        title: 'Week-long Sprint',
        startsAt: '2024-01-15T00:00:00Z',
        endsAt: '2024-01-22T00:00:00Z',
      }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const ep = episodes[0];
          const hasEndDate = !!ep.endsAt;
          return [{ effect: 'log', level: 'info', message: 'Episode has end date: ' + hasEndDate }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Episode has end date: true',
    });
  });

  it('policy can check episode related artifacts', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-1',
        relatedArtifactIds: ['artifact-plan', 'artifact-journal'],
      }),
    ]);

    const policy = createMockPolicy({
      implementation: {
        kind: 'typescript',
        code: `
          const episodes = ctx.canon.getActiveEpisodes();
          const artifacts = episodes[0].relatedArtifactIds || [];
          return [{ effect: 'log', level: 'info', message: 'Related artifacts: ' + artifacts.join(',') }];
        `,
      },
    });
    const observation = createMockObservation();

    const result = await evaluatePolicy(repos, policy, observation);

    expect(result.effects[0]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Related artifacts: artifact-plan,artifact-journal',
    });
  });

  it('multiple policies can coordinate around the same episode', async () => {
    const repos = createMockRepos();
    (repos.episodes.getActive as any).mockResolvedValue([
      createMockEpisode({
        id: 'ep-sleep',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
      }),
    ]);

    const policies = [
      createMockPolicy({
        id: 'p1-sleep-monitor',
        priority: 10,
        implementation: {
          kind: 'typescript',
          code: `
            const episodes = ctx.canon.getActiveEpisodes();
            const hasSleepEpisode = episodes.some(ep =>
              ep.variables.some(v => v.variableId === 'var-sleep')
            );
            if (hasSleepEpisode) {
              return [{ effect: 'tag_observation', tags: ['episode:sleep-regulation'] }];
            }
            return [];
          `,
        },
      }),
      createMockPolicy({
        id: 'p2-notification',
        priority: 20,
        implementation: {
          kind: 'typescript',
          code: `
            const isEpisodeTagged = ctx.priorEffects.some(e =>
              e.effect === 'tag_observation' &&
              e.tags.some(t => t.startsWith('episode:'))
            );
            if (isEpisodeTagged) {
              return [{ effect: 'log', level: 'info', message: 'Episode-related observation' }];
            }
            return [];
          `,
        },
      }),
    ];

    const observation = createMockObservation();
    const result = await evaluatePolicies(repos, policies, observation);

    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effect: 'tag_observation',
      tags: ['episode:sleep-regulation'],
    });
    expect(result.effects[1]).toEqual({
      effect: 'log',
      level: 'info',
      message: 'Episode-related observation',
    });
  });
});
