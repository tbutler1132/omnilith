// Tests for determinism checking

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Policy, Entity } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  checkPolicyDeterminism,
  checkPoliciesDeterminism,
  detectNonDeterministicPatterns,
  createTestObservation,
} from './determinism.js';
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

function createMockPolicy(code: string, overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    nodeId: 'node-1',
    name: 'Test Policy',
    priority: 100,
    enabled: true,
    triggers: ['test.*'],
    implementation: {
      kind: 'typescript',
      code,
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockRepos(): RepositoryContext {
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
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockEntity(id))),
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
  } as unknown as RepositoryContext;
}

// --- Pattern Detection Tests ---

describe('detectNonDeterministicPatterns', () => {
  it('detects Date.now()', () => {
    const policy = createMockPolicy('const time = Date.now(); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('Date.now()');
    expect(patterns[0].severity).toBe('error');
    expect(patterns[0].matchedCode).toBe('Date.now()');
  });

  it('detects new Date() without arguments', () => {
    const policy = createMockPolicy('const now = new Date(); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('new Date()');
    expect(patterns[0].severity).toBe('error');
  });

  it('does NOT flag new Date(timestamp)', () => {
    const policy = createMockPolicy('const date = new Date(ctx.observation.timestamp); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    // Should not match because new Date() requires empty parens
    const datePatterns = patterns.filter((p) => p.name === 'new Date()');
    expect(datePatterns).toHaveLength(0);
  });

  it('detects Math.random()', () => {
    const policy = createMockPolicy('const rand = Math.random(); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('Math.random()');
    expect(patterns[0].severity).toBe('error');
  });

  it('detects crypto.randomUUID()', () => {
    const policy = createMockPolicy('const id = crypto.randomUUID(); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('crypto.randomUUID()');
    expect(patterns[0].severity).toBe('error');
  });

  it('detects fetch()', () => {
    const policy = createMockPolicy('await fetch("https://api.example.com"); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('fetch()');
    expect(patterns[0].severity).toBe('error');
  });

  it('detects setTimeout and setInterval', () => {
    const policy = createMockPolicy('setTimeout(() => {}, 100); setInterval(() => {}, 1000); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(2);
    expect(patterns.every((p) => p.name === 'setTimeout/setInterval')).toBe(true);
  });

  it('detects console.log (warning level)', () => {
    const policy = createMockPolicy('console.log("debug"); return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('console.*');
    expect(patterns[0].severity).toBe('warning');
  });

  it('detects process.env (warning level)', () => {
    const policy = createMockPolicy('const key = process.env.API_KEY; return [];');
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('process.env');
    expect(patterns[0].severity).toBe('warning');
  });

  it('detects multiple patterns', () => {
    const policy = createMockPolicy(`
      const now = Date.now();
      const rand = Math.random();
      console.log("test");
      return [];
    `);
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns.length).toBeGreaterThanOrEqual(3);
  });

  it('reports correct line numbers', () => {
    const policy = createMockPolicy(`const a = 1;
const b = 2;
const now = Date.now();
return [];`);
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].lineNumber).toBe(3);
  });

  it('returns empty array for clean policy', () => {
    const policy = createMockPolicy(`
      const value = ctx.observation.payload.value;
      if (value > 10) {
        return [{ effect: "log", level: "info", message: "High value" }];
      }
      return [];
    `);
    const patterns = detectNonDeterministicPatterns(policy);

    expect(patterns).toHaveLength(0);
  });
});

// --- Determinism Check Tests ---

describe('checkPolicyDeterminism', () => {
  it('identifies deterministic policy', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy(`
      const value = ctx.observation.payload.value ?? 0;
      return [{ effect: "log", level: "info", message: String(value) }];
    `);
    const observation = createTestObservation('node-1', 'test.event', { value: 42 });

    const result = await checkPolicyDeterminism(repos, policy, observation);

    expect(result.isDeterministic).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.iterations).toBe(3); // Default iterations
    expect(result.effectsByIteration).toHaveLength(3);

    // All iterations should produce identical effects
    const firstEffects = JSON.stringify(result.effectsByIteration[0]);
    result.effectsByIteration.forEach((effects) => {
      expect(JSON.stringify(effects)).toBe(firstEffects);
    });
  });

  it('flags policy with non-deterministic patterns even if runtime is deterministic', async () => {
    const repos = createMockRepos();
    // This policy has Date.now() but doesn't use its result in effects
    // Still flagged because it's a smell
    const policy = createMockPolicy(`
      const _unused = Date.now();
      return [{ effect: "log", level: "info", message: "static" }];
    `);
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation, {
      checkPatterns: true,
    });

    expect(result.isDeterministic).toBe(false);
    expect(result.detectedPatterns.length).toBeGreaterThan(0);
    expect(result.detectedPatterns.some((p) => p.name === 'Date.now()')).toBe(true);
  });

  it('passes with warning-level patterns only', async () => {
    const repos = createMockRepos();
    // console.log is warning level, not error
    const policy = createMockPolicy(`
      console.log("debug");
      return [{ effect: "log", level: "info", message: "result" }];
    `);
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation);

    expect(result.isDeterministic).toBe(true); // Only warnings, not errors
    expect(result.detectedPatterns).toHaveLength(1);
    expect(result.detectedPatterns[0].severity).toBe('warning');
  });

  it('handles policy errors', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy('throw new Error("Policy error");');
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation);

    // Policy errors produce empty effects, which are deterministic (consistently empty)
    expect(result.isDeterministic).toBe(true);
    expect(result.effectsByIteration.every((e) => e.length === 0)).toBe(true);
  });

  it('uses fixed timestamp for deterministic evaluation', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy(`
      return [{ effect: "log", level: "info", message: ctx.evaluatedAt }];
    `);
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation, {
      evaluatedAt: '2024-01-15T00:00:00Z',
    });

    expect(result.isDeterministic).toBe(true);
    result.effectsByIteration.forEach((effects) => {
      expect((effects[0] as any).message).toBe('2024-01-15T00:00:00Z');
    });
  });

  it('respects iterations option', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy('return [];');
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation, {
      iterations: 5,
    });

    expect(result.iterations).toBe(5);
    expect(result.effectsByIteration).toHaveLength(5);
  });

  it('can skip pattern checking', async () => {
    const repos = createMockRepos();
    const policy = createMockPolicy(`
      const _unused = Date.now();
      return [];
    `);
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPolicyDeterminism(repos, policy, observation, {
      checkPatterns: false,
    });

    expect(result.isDeterministic).toBe(true); // No pattern check means no flags
    expect(result.detectedPatterns).toHaveLength(0);
  });
});

// --- Batch Determinism Check Tests ---

describe('checkPoliciesDeterminism', () => {
  it('checks multiple policies', async () => {
    const repos = createMockRepos();
    const policies = [
      createMockPolicy('return [];', { id: 'policy-1' }),
      createMockPolicy('return [{ effect: "log", level: "info", message: "test" }];', { id: 'policy-2' }),
      createMockPolicy('const x = Date.now(); return [];', { id: 'policy-3' }),
    ];
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPoliciesDeterminism(repos, policies, observation);

    expect(result.totalChecked).toBe(3);
    expect(result.deterministicCount).toBe(2);
    expect(result.nonDeterministicCount).toBe(1);
    expect(result.results.size).toBe(3);

    expect(result.results.get('policy-1')!.isDeterministic).toBe(true);
    expect(result.results.get('policy-2')!.isDeterministic).toBe(true);
    expect(result.results.get('policy-3')!.isDeterministic).toBe(false);
  });

  it('handles empty policy list', async () => {
    const repos = createMockRepos();
    const observation = createTestObservation('node-1', 'test.event');

    const result = await checkPoliciesDeterminism(repos, [], observation);

    expect(result.totalChecked).toBe(0);
    expect(result.deterministicCount).toBe(0);
    expect(result.nonDeterministicCount).toBe(0);
  });
});

// --- Test Observation Helper Tests ---

describe('createTestObservation', () => {
  it('creates observation with fixed timestamp', () => {
    const obs = createTestObservation('node-1', 'test.event');

    expect(obs.nodeId).toBe('node-1');
    expect(obs.type).toBe('test.event');
    expect(obs.timestamp).toBe('2024-01-15T00:00:00.000Z');
    expect(obs.provenance.sourceId).toBe('node-1');
    expect(obs.provenance.method).toBe('test');
  });

  it('accepts custom payload', () => {
    const obs = createTestObservation('node-1', 'test.event', { value: 42 });

    expect(obs.payload).toEqual({ value: 42 });
  });

  it('generates deterministic ID', () => {
    const obs1 = createTestObservation('node-1', 'test.event');
    const obs2 = createTestObservation('node-1', 'test.event');

    expect(obs1.id).toBe(obs2.id);
  });
});
