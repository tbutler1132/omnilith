// Tests for Prism - The Commit Boundary (Phase 10)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Node,
  Artifact,
  Episode,
  Variable,
  ActionRun,
} from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { Prism, createPrism } from './prism.js';
import { createInMemoryAuditStore } from './audit.js';

// --- Test Fixtures ---

function createMockNode(
  id: string,
  kind: 'subject' | 'object' | 'agent' = 'subject'
): Node {
  return {
    id,
    kind,
    name: `Test Node ${id}`,
    edges: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockArtifact(id: string, nodeId: string): Artifact {
  return {
    id,
    nodeId,
    title: 'Test Artifact',
    about: 'Test description',
    page: { version: 1, blocks: [] },
    status: 'draft',
    trunkVersion: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockEpisode(id: string, nodeId: string): Episode {
  return {
    id,
    nodeId,
    title: 'Test Episode',
    kind: 'regulatory',
    variables: [],
    status: 'planned',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockVariable(id: string, nodeId: string): Variable {
  return {
    id,
    nodeId,
    key: 'test_var',
    title: 'Test Variable',
    kind: 'continuous',
    computeSpecs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockActionRun(
  id: string,
  nodeId: string,
  overrides: Partial<ActionRun> = {}
): ActionRun {
  return {
    id,
    nodeId,
    proposedBy: { policyId: 'policy-1', observationId: 'obs-1' },
    action: { actionType: 'test_action', params: {} },
    riskLevel: 'medium',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockRepos(overrides: Partial<RepositoryContext> = {}): RepositoryContext {
  return {
    nodes: {
      get: vi.fn().mockImplementation((id) => {
        if (id === 'subject-node') return Promise.resolve(createMockNode('subject-node', 'subject'));
        if (id === 'agent-node') return Promise.resolve(createMockNode('agent-node', 'agent'));
        if (id === 'object-node') return Promise.resolve(createMockNode('object-node', 'object'));
        return Promise.resolve(null);
      }),
      getEdges: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockNode(input.id ?? 'new-node', input.kind))
      ),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...createMockNode(id), ...updates })
      ),
      addEdge: vi.fn().mockResolvedValue({ fromNodeId: '', toNodeId: '', type: 'follows' }),
      removeEdge: vi.fn().mockResolvedValue(true),
      setAgentDelegation: vi.fn().mockImplementation((agentId, delegation) =>
        Promise.resolve(delegation)
      ),
      getAgentDelegation: vi.fn().mockResolvedValue(null),
      revokeAgentDelegation: vi.fn().mockResolvedValue(true),
      ...overrides.nodes,
    },
    observations: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      append: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      getByType: vi.fn().mockResolvedValue([]),
      getRecent: vi.fn().mockResolvedValue([]),
      stream: vi.fn(),
      ...overrides.observations,
    },
    artifacts: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockArtifact(input.id ?? 'new-artifact', input.nodeId))
      ),
      list: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...createMockArtifact(id, 'node-1'), ...updates })
      ),
      updateStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...createMockArtifact(id, 'node-1'), status })
      ),
      getRevisions: vi.fn().mockResolvedValue([]),
      getRevision: vi.fn().mockResolvedValue(null),
      getByEntityRef: vi.fn().mockResolvedValue([]),
      ...overrides.artifacts,
    },
    entities: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input, actorId) =>
        Promise.resolve({
          id: input.id ?? 'new-entity',
          nodeId: input.nodeId,
          typeId: input.typeId,
          state: input.initialState ?? {},
          events: [
            {
              id: 'event-1',
              entityId: input.id ?? 'new-entity',
              type: 'created',
              data: input.initialState ?? {},
              timestamp: '2024-01-01T00:00:00Z',
              actorNodeId: actorId,
            },
          ],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      ),
      query: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockImplementation((id, event) =>
        Promise.resolve({
          id,
          nodeId: 'node-1',
          typeId: 'type-1',
          state: { ...event.data },
          events: [
            {
              id: 'event-1',
              entityId: id,
              type: event.type,
              data: event.data,
              timestamp: event.timestamp ?? '2024-01-01T00:00:00Z',
              actorNodeId: event.actorNodeId,
            },
          ],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      ),
      getEvents: vi.fn().mockResolvedValue([]),
      queryEvents: vi.fn().mockResolvedValue([]),
      materializeState: vi.fn(),
      createType: vi.fn(),
      getType: vi.fn().mockResolvedValue(null),
      getTypeByName: vi.fn().mockResolvedValue(null),
      listTypes: vi.fn().mockResolvedValue([]),
      ...overrides.entities,
    },
    variables: {
      get: vi.fn().mockResolvedValue(null),
      getByKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockVariable(input.id ?? 'new-var', input.nodeId))
      ),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...createMockVariable(id, 'node-1'), ...updates })
      ),
      addComputeSpec: vi.fn(),
      updateComputeSpec: vi.fn(),
      removeComputeSpec: vi.fn(),
      getByNode: vi.fn().mockResolvedValue([]),
      ...overrides.variables,
    },
    episodes: {
      getActive: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockEpisode(input.id ?? 'new-episode', input.nodeId))
      ),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...createMockEpisode(id, 'node-1'), ...updates })
      ),
      updateStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...createMockEpisode(id, 'node-1'), status })
      ),
      getByVariable: vi.fn().mockResolvedValue([]),
      getByArtifact: vi.fn().mockResolvedValue([]),
      ...overrides.episodes,
    },
    grants: {
      getForGrantee: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: input.id ?? 'new-grant',
          granteeNodeId: input.granteeNodeId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          scopes: input.scopes,
          grantorNodeId: input.grantorNodeId,
          grantedAt: '2024-01-01T00:00:00Z',
          status: 'active',
        })
      ),
      query: vi.fn().mockResolvedValue([]),
      revoke: vi.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          granteeNodeId: 'node-1',
          resourceType: 'artifact',
          resourceId: 'artifact-1',
          scopes: ['read'],
          grantorNodeId: 'node-2',
          grantedAt: '2024-01-01T00:00:00Z',
          revokedAt: '2024-01-02T00:00:00Z',
          status: 'revoked',
        })
      ),
      hasAccess: vi.fn().mockResolvedValue(false),
      getForResource: vi.fn().mockResolvedValue([]),
      getByGrantor: vi.fn().mockResolvedValue([]),
      getGrantedScopes: vi.fn().mockResolvedValue([]),
      ...overrides.grants,
    },
    policies: {
      getByTrigger: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: input.id ?? 'new-policy',
          nodeId: input.nodeId,
          name: input.name,
          description: input.description,
          priority: input.priority,
          enabled: input.enabled ?? true,
          triggers: input.triggers,
          implementation: input.implementation,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      ),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({
          id,
          nodeId: 'node-1',
          name: 'Test Policy',
          priority: 0,
          enabled: true,
          triggers: ['*'],
          implementation: { kind: 'typescript', code: 'return []' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          ...updates,
        })
      ),
      getByNode: vi.fn().mockResolvedValue([]),
      setEnabled: vi.fn().mockImplementation((id, enabled) =>
        Promise.resolve({
          id,
          nodeId: 'node-1',
          name: 'Test Policy',
          priority: 0,
          enabled,
          triggers: ['*'],
          implementation: { kind: 'typescript', code: 'return []' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      ),
      ...overrides.policies,
    },
    actionRuns: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(createMockActionRun('new-action', input.nodeId, input))
      ),
      query: vi.fn().mockResolvedValue([]),
      approve: vi.fn().mockImplementation((id, approval) =>
        Promise.resolve({
          ...createMockActionRun(id, 'node-1'),
          status: 'approved',
          approval,
        })
      ),
      reject: vi.fn().mockImplementation((id, rejection) =>
        Promise.resolve({
          ...createMockActionRun(id, 'node-1'),
          status: 'rejected',
          rejection,
        })
      ),
      markExecuted: vi.fn().mockImplementation((id, execution) =>
        Promise.resolve({
          ...createMockActionRun(id, 'node-1'),
          status: 'executed',
          execution,
        })
      ),
      markFailed: vi.fn().mockImplementation((id, execution) =>
        Promise.resolve({
          ...createMockActionRun(id, 'node-1'),
          status: 'failed',
          execution,
        })
      ),
      getPendingApproval: vi.fn().mockResolvedValue([]),
      ...overrides.actionRuns,
    },
    surfaces: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: input.id ?? 'new-surface',
          nodeId: input.nodeId,
          kind: input.kind,
          title: input.title,
          visibility: input.visibility,
          entry: input.entry ?? {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        })
      ),
      list: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({
          id,
          nodeId: 'node-1',
          kind: 'page',
          title: 'Test Surface',
          visibility: 'private',
          entry: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          ...updates,
        })
      ),
      delete: vi.fn().mockResolvedValue(true),
      getByNode: vi.fn().mockResolvedValue([]),
      getVisible: vi.fn().mockResolvedValue([]),
      getLayout: vi.fn().mockResolvedValue(null),
      createLayout: vi.fn(),
      updateLayout: vi.fn(),
      deleteLayout: vi.fn(),
      getLayoutsByNode: vi.fn().mockResolvedValue([]),
      ...overrides.surfaces,
    },
    ...overrides,
  } as RepositoryContext;
}

// --- Tests ---

describe('Prism', () => {
  let repos: RepositoryContext;
  let auditStore: ReturnType<typeof createInMemoryAuditStore>;
  let prism: Prism;

  beforeEach(() => {
    repos = createMockRepos();
    auditStore = createInMemoryAuditStore();
    prism = createPrism({
      repos,
      auditStore,
      config: { transactionsEnabled: false }, // Disable transactions for unit tests
    });
  });

  describe('createPrism', () => {
    it('creates a Prism instance', () => {
      expect(prism).toBeInstanceOf(Prism);
    });
  });

  describe('execute', () => {
    describe('validation', () => {
      it('requires actor.nodeId', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: '' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('actor.nodeId');
      });

      it('validates artifact title is required', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: '',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('title');
      });

      it('validates artifact about is required', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: '',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('about');
      });
    });

    describe('authorization', () => {
      it('rejects operations from non-existent actors', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'non-existent' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Actor node not found');
      });

      it('rejects operations from object nodes', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'object-node' },
          nodeId: 'object-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Object nodes cannot initiate mutations');
      });

      it('allows operations from subject nodes', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('artifact');
      });

      it('checks agent delegation for agent nodes', async () => {
        // Agent without delegation should fail
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'agent-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('no delegation');
      });

      it('allows agent operations with valid delegation', async () => {
        // Set up delegation
        (repos.nodes.getAgentDelegation as ReturnType<typeof vi.fn>).mockResolvedValue({
          agentNodeId: 'agent-node',
          sponsorNodeId: 'subject-node',
          grantedAt: '2024-01-01T00:00:00Z',
          scopes: ['create_artifact'],
        });

        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'agent-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(true);
      });

      it('rejects agent operations with expired delegation', async () => {
        // Set up expired delegation
        (repos.nodes.getAgentDelegation as ReturnType<typeof vi.fn>).mockResolvedValue({
          agentNodeId: 'agent-node',
          sponsorNodeId: 'subject-node',
          grantedAt: '2024-01-01T00:00:00Z',
          scopes: ['create_artifact'],
          constraints: {
            expiresAt: '2020-01-01T00:00:00Z', // Expired
          },
        });

        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'agent-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('expired');
      });
    });

    describe('audit logging', () => {
      it('creates audit entry on success', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node', method: 'manual' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.audit).toBeDefined();
        expect(result.audit.success).toBe(true);
        expect(result.audit.operationType).toBe('create_artifact');
        expect(result.audit.resourceType).toBe('artifact');
        expect(result.audit.actor.nodeId).toBe('subject-node');
        expect(result.audit.actor.method).toBe('manual');

        // Verify audit was stored
        const stored = await auditStore.get(result.audit.id);
        expect(stored).toEqual(result.audit);
      });

      it('creates audit entry on failure', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'non-existent' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.audit).toBeDefined();
        expect(result.audit.success).toBe(false);
        expect(result.audit.error).toBeDefined();

        // Verify audit was stored
        const stored = await auditStore.get(result.audit.id);
        expect(stored).toEqual(result.audit);
      });

      it('includes causality information', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Test',
            about: 'Description',
            page: { version: 1, blocks: [] },
          },
          causedBy: {
            observationId: 'obs-1',
            policyId: 'policy-1',
          },
        });

        expect(result.audit.causedBy).toEqual({
          observationId: 'obs-1',
          policyId: 'policy-1',
        });
      });
    });

    describe('artifact operations', () => {
      it('creates an artifact', async () => {
        const result = await prism.execute({
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'My Document',
            about: 'A test document',
            page: { version: 1, blocks: [] },
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('artifact');
        expect(repos.artifacts.create).toHaveBeenCalled();
      });

      it('updates an artifact', async () => {
        (repos.artifacts.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockArtifact('artifact-1', 'subject-node')
        );

        const result = await prism.execute({
          type: 'update_artifact',
          actor: { nodeId: 'subject-node' },
          artifactId: 'artifact-1',
          updates: { title: 'Updated Title' },
        });

        expect(result.success).toBe(true);
        expect(repos.artifacts.update).toHaveBeenCalled();
      });

      it('updates artifact status', async () => {
        (repos.artifacts.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockArtifact('artifact-1', 'subject-node')
        );

        const result = await prism.execute({
          type: 'update_artifact_status',
          actor: { nodeId: 'subject-node' },
          artifactId: 'artifact-1',
          status: 'published',
        });

        expect(result.success).toBe(true);
        expect(repos.artifacts.updateStatus).toHaveBeenCalled();
      });

      it('deletes an artifact (archives it)', async () => {
        const result = await prism.execute({
          type: 'delete_artifact',
          actor: { nodeId: 'subject-node' },
          artifactId: 'artifact-1',
        });

        expect(result.success).toBe(true);
        // Delete operation archives the artifact since ArtifactRepository doesn't have delete
        expect(repos.artifacts.updateStatus).toHaveBeenCalledWith(
          'artifact-1',
          'archived',
          'subject-node'
        );
      });
    });

    describe('episode operations', () => {
      it('creates an episode', async () => {
        const result = await prism.execute({
          type: 'create_episode',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          episode: {
            title: 'Sleep Improvement',
            kind: 'regulatory',
            variables: [{ variableId: 'var-1', intent: 'stabilize' }],
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('episode');
        expect(repos.episodes.create).toHaveBeenCalled();
      });

      it('updates episode status', async () => {
        (repos.episodes.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockEpisode('episode-1', 'subject-node')
        );

        const result = await prism.execute({
          type: 'update_episode_status',
          actor: { nodeId: 'subject-node' },
          episodeId: 'episode-1',
          status: 'active',
        });

        expect(result.success).toBe(true);
        expect(repos.episodes.updateStatus).toHaveBeenCalled();
      });
    });

    describe('variable operations', () => {
      it('creates a variable', async () => {
        const result = await prism.execute({
          type: 'create_variable',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          variable: {
            key: 'sleep_quality',
            title: 'Sleep Quality',
            kind: 'continuous',
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('variable');
        expect(repos.variables.create).toHaveBeenCalled();
      });

      it('updates a variable', async () => {
        (repos.variables.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockVariable('var-1', 'subject-node')
        );

        const result = await prism.execute({
          type: 'update_variable',
          actor: { nodeId: 'subject-node' },
          variableId: 'var-1',
          updates: { title: 'Updated Variable' },
        });

        expect(result.success).toBe(true);
        expect(repos.variables.update).toHaveBeenCalled();
      });
    });

    describe('action run operations', () => {
      it('approves an action run', async () => {
        (repos.actionRuns.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockActionRun('action-1', 'subject-node', { status: 'pending' })
        );

        const result = await prism.execute({
          type: 'approve_action_run',
          actor: { nodeId: 'subject-node' },
          actionRunId: 'action-1',
          method: 'manual',
        });

        expect(result.success).toBe(true);
        expect(repos.actionRuns.approve).toHaveBeenCalled();
      });

      it('rejects an action run', async () => {
        (repos.actionRuns.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockActionRun('action-1', 'subject-node', { status: 'pending' })
        );

        const result = await prism.execute({
          type: 'reject_action_run',
          actor: { nodeId: 'subject-node' },
          actionRunId: 'action-1',
          reason: 'Not appropriate',
        });

        expect(result.success).toBe(true);
        expect(repos.actionRuns.reject).toHaveBeenCalled();
      });

      it('validates rejection requires reason', async () => {
        const result = await prism.execute({
          type: 'reject_action_run',
          actor: { nodeId: 'subject-node' },
          actionRunId: 'action-1',
          reason: '',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('reason');
      });

      it('enforces agent risk level constraints for action approval', async () => {
        // Set up agent with maxRiskLevel constraint
        (repos.nodes.getAgentDelegation as ReturnType<typeof vi.fn>).mockResolvedValue({
          agentNodeId: 'agent-node',
          sponsorNodeId: 'subject-node',
          grantedAt: '2024-01-01T00:00:00Z',
          scopes: ['approve_action'],
          constraints: {
            maxRiskLevel: 'low', // Can only approve low-risk
          },
        });

        // Action run is medium risk
        (repos.actionRuns.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          createMockActionRun('action-1', 'subject-node', {
            status: 'pending',
            riskLevel: 'medium',
          })
        );

        const result = await prism.execute({
          type: 'approve_action_run',
          actor: { nodeId: 'agent-node' },
          actionRunId: 'action-1',
          method: 'auto',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('medium risk');
      });
    });

    describe('surface operations', () => {
      it('creates a surface', async () => {
        const result = await prism.execute({
          type: 'create_surface',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          surface: {
            kind: 'page',
            title: 'Home',
            visibility: 'public',
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('surface');
        expect(repos.surfaces.create).toHaveBeenCalled();
      });
    });

    describe('entity operations', () => {
      it('creates an entity', async () => {
        const result = await prism.execute({
          type: 'create_entity',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          entity: {
            typeId: 'song',
            initialState: { title: 'My Song' },
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('entity');
        expect(repos.entities.create).toHaveBeenCalled();
      });

      it('appends entity event', async () => {
        (repos.entities.get as ReturnType<typeof vi.fn>).mockResolvedValue({
          id: 'entity-1',
          nodeId: 'subject-node',
          typeId: 'song',
          state: { title: 'My Song' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        });

        const result = await prism.execute({
          type: 'append_entity_event',
          actor: { nodeId: 'subject-node' },
          entityId: 'entity-1',
          event: {
            type: 'title_changed',
            data: { title: 'New Title' },
          },
        });

        expect(result.success).toBe(true);
        expect(repos.entities.appendEvent).toHaveBeenCalled();
      });
    });

    describe('node operations', () => {
      it('creates a node', async () => {
        const result = await prism.execute({
          type: 'create_node',
          actor: { nodeId: 'subject-node' },
          node: {
            kind: 'object',
            name: 'My Project',
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('node');
        expect(repos.nodes.create).toHaveBeenCalled();
      });

      it('adds an edge', async () => {
        const result = await prism.execute({
          type: 'add_edge',
          actor: { nodeId: 'subject-node' },
          fromNodeId: 'subject-node',
          toNodeId: 'object-node',
          edgeType: 'maintains',
        });

        expect(result.success).toBe(true);
        expect(repos.nodes.addEdge).toHaveBeenCalled();
      });
    });

    describe('grant operations', () => {
      it('creates a grant', async () => {
        const result = await prism.execute({
          type: 'create_grant',
          actor: { nodeId: 'subject-node' },
          grant: {
            granteeNodeId: 'agent-node',
            resourceType: 'artifact',
            resourceId: 'artifact-1',
            scopes: ['read', 'write'],
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('grant');
        expect(repos.grants.create).toHaveBeenCalled();
      });

      it('revokes a grant', async () => {
        const result = await prism.execute({
          type: 'revoke_grant',
          actor: { nodeId: 'subject-node' },
          grantId: 'grant-1',
          reason: 'No longer needed',
        });

        expect(result.success).toBe(true);
        expect(repos.grants.revoke).toHaveBeenCalled();
      });
    });

    describe('policy operations', () => {
      it('creates a policy', async () => {
        const result = await prism.execute({
          type: 'create_policy',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          policy: {
            name: 'Sleep Monitor',
            priority: 10,
            enabled: true,
            trigger: { observationType: 'health.sleep' },
            evaluatorCode: 'return [];',
          },
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('policy');
        expect(repos.policies.create).toHaveBeenCalled();
      });
    });
  });

  describe('executeBatch', () => {
    it('executes multiple operations', async () => {
      const results = await prism.executeBatch([
        {
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Doc 1',
            about: 'First document',
            page: { version: 1, blocks: [] },
          },
        },
        {
          type: 'create_artifact',
          actor: { nodeId: 'subject-node' },
          nodeId: 'subject-node',
          artifact: {
            title: 'Doc 2',
            about: 'Second document',
            page: { version: 1, blocks: [] },
          },
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });
});

describe('createInMemoryAuditStore', () => {
  it('stores and retrieves audit entries', async () => {
    const store = createInMemoryAuditStore();
    const entry = {
      id: 'audit-1',
      timestamp: '2024-01-01T00:00:00Z',
      nodeId: 'node-1',
      actor: { nodeId: 'actor-1', kind: 'subject' as const, method: 'manual' as const },
      operationType: 'create_artifact' as const,
      resourceType: 'artifact' as const,
      resourceId: 'artifact-1',
      details: {},
      success: true,
    };

    await store.append(entry);
    const retrieved = await store.get('audit-1');

    expect(retrieved).toEqual(entry);
  });

  it('queries by node ID', async () => {
    const store = createInMemoryAuditStore();
    await store.append({
      id: 'audit-1',
      timestamp: '2024-01-01T00:00:00Z',
      nodeId: 'node-1',
      actor: { nodeId: 'actor-1', kind: 'subject', method: 'manual' },
      operationType: 'create_artifact',
      resourceType: 'artifact',
      details: {},
      success: true,
    });
    await store.append({
      id: 'audit-2',
      timestamp: '2024-01-02T00:00:00Z',
      nodeId: 'node-2',
      actor: { nodeId: 'actor-1', kind: 'subject', method: 'manual' },
      operationType: 'create_artifact',
      resourceType: 'artifact',
      details: {},
      success: true,
    });

    const results = await store.getByNode('node-1');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('audit-1');
  });

  it('queries by resource', async () => {
    const store = createInMemoryAuditStore();
    await store.append({
      id: 'audit-1',
      timestamp: '2024-01-01T00:00:00Z',
      nodeId: 'node-1',
      actor: { nodeId: 'actor-1', kind: 'subject', method: 'manual' },
      operationType: 'create_artifact',
      resourceType: 'artifact',
      resourceId: 'artifact-1',
      details: {},
      success: true,
    });

    const results = await store.getByResource('artifact', 'artifact-1');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('audit-1');
  });

  it('supports pagination', async () => {
    const store = createInMemoryAuditStore();
    for (let i = 0; i < 10; i++) {
      await store.append({
        id: `audit-${i}`,
        timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        nodeId: 'node-1',
        actor: { nodeId: 'actor-1', kind: 'subject', method: 'manual' },
        operationType: 'create_artifact',
        resourceType: 'artifact',
        details: {},
        success: true,
      });
    }

    const page1 = await store.query({ limit: 3 });
    const page2 = await store.query({ limit: 3, offset: 3 });

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    // Most recent first
    expect(page1[0].id).toBe('audit-9');
  });
});
