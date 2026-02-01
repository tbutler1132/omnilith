// Tests for Core Action Handlers (Phase 3.2)

import { describe, it, expect, vi } from 'vitest';
import type { Node, ActionRun, Artifact, Episode, Entity, Variable, Grant } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import {
  createArtifactHandler,
  updateArtifactHandler,
  updateArtifactStatusHandler,
  createEpisodeHandler,
  updateEpisodeStatusHandler,
  createEntityHandler,
  createEntityEventHandler,
  createVariableHandler,
  createGrantHandler,
  revokeGrantHandler,
  registerCoreActions,
  coreActionDefinitions,
} from './handlers.js';
import { createActionRegistry, type ActionExecutionContext } from './lifecycle.js';

// --- Test Fixtures ---

function createMockNode(id: string): Node {
  return {
    id,
    kind: 'subject',
    name: `Test Node ${id}`,
    edges: [],
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
    status: 'approved',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockArtifact(id: string): Artifact {
  return {
    id,
    nodeId: 'node-1',
    title: 'Test Artifact',
    about: 'Test artifact description',
    status: 'draft',
    trunkVersion: 1,
    page: { version: 1, blocks: [] },
    entityRefs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockEpisode(id: string): Episode {
  return {
    id,
    nodeId: 'node-1',
    title: 'Test Episode',
    kind: 'regulatory',
    variables: [],
    status: 'planned',
    relatedArtifactIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockEntity(id: string): Entity {
  return {
    id,
    nodeId: 'node-1',
    typeId: 'type-1',
    state: {},
    events: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockVariable(id: string): Variable {
  return {
    id,
    nodeId: 'node-1',
    key: 'test_variable',
    title: 'Test Variable',
    kind: 'continuous',
    computeSpecs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockGrant(id: string): Grant {
  return {
    id,
    grantorNodeId: 'node-1',
    granteeNodeId: 'node-2',
    resourceType: 'artifact',
    resourceId: 'artifact-1',
    scopes: ['read'],
    grantedAt: '2024-01-01T00:00:00Z',
  };
}

function createMockRepos(): RepositoryContext {
  return {
    nodes: {
      get: vi.fn().mockResolvedValue(createMockNode('node-1')),
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
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockArtifact(id))),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockArtifact('new-artifact'), ...input })
      ),
      list: vi.fn(),
      query: vi.fn(),
      update: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...createMockArtifact(id), ...updates, trunkVersion: 2 })
      ),
      updateStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...createMockArtifact(id), status })
      ),
      getRevisions: vi.fn(),
      getRevision: vi.fn(),
      getByEntityRef: vi.fn(),
    },
    entities: {
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockEntity(id))),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockEntity('new-entity'), ...input })
      ),
      query: vi.fn(),
      appendEvent: vi.fn().mockImplementation((id) =>
        Promise.resolve(createMockEntity(id))
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
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockVariable('new-variable'), ...input })
      ),
      list: vi.fn(),
      update: vi.fn(),
      addComputeSpec: vi.fn(),
      updateComputeSpec: vi.fn(),
      removeComputeSpec: vi.fn(),
      getByNode: vi.fn(),
    },
    episodes: {
      getActive: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockEpisode(id))),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockEpisode('new-episode'), ...input })
      ),
      list: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...createMockEpisode(id), status })
      ),
      getByVariable: vi.fn(),
      getByArtifact: vi.fn(),
    },
    grants: {
      getForGrantee: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockImplementation((id) => Promise.resolve(createMockGrant(id))),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve({ ...createMockGrant('new-grant'), ...input })
      ),
      query: vi.fn(),
      revoke: vi.fn().mockResolvedValue(createMockGrant('grant-1')),
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

function createMockContext(repos: RepositoryContext): ActionExecutionContext {
  return {
    actionRun: createMockActionRun('action-1'),
    repos,
    node: createMockNode('node-1'),
  };
}

// --- Registration Tests ---

describe('registerCoreActions', () => {
  it('registers all core actions with a registry', () => {
    const registry = createActionRegistry();

    registerCoreActions(registry);

    // Check all core actions are registered
    expect(registry.has('create_artifact')).toBe(true);
    expect(registry.has('update_artifact')).toBe(true);
    expect(registry.has('update_artifact_status')).toBe(true);
    expect(registry.has('create_episode')).toBe(true);
    expect(registry.has('update_episode_status')).toBe(true);
    expect(registry.has('create_entity')).toBe(true);
    expect(registry.has('create_entity_event')).toBe(true);
    expect(registry.has('create_variable')).toBe(true);
    expect(registry.has('create_grant')).toBe(true);
    expect(registry.has('revoke_grant')).toBe(true);
  });

  it('provides correct number of core action definitions', () => {
    expect(coreActionDefinitions.length).toBe(10);
  });
});

// --- Artifact Handler Tests ---

describe('createArtifactHandler', () => {
  it('creates an artifact with required fields', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createArtifactHandler(
      { title: 'My Document', about: 'My new document' },
      ctx
    );

    expect((result as { artifactId: string }).artifactId).toBeDefined();
    expect(repos.artifacts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        title: 'My Document',
        about: 'My new document',
        status: 'draft',
      }),
      expect.objectContaining({
        authorNodeId: 'node-1',
      })
    );
  });

  it('creates an artifact with all optional fields', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createArtifactHandler(
      {
        title: 'My Document',
        about: 'My document',
        status: 'active',
        page: { version: 1, blocks: [{ id: 'b1', type: 'paragraph', content: 'World' }] },
        entityRefs: ['entity-1'],
      },
      ctx
    );

    expect((result as { artifactId: string }).artifactId).toBeDefined();
    expect(repos.artifacts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        entityRefs: ['entity-1'],
      }),
      expect.anything()
    );
  });
});

describe('updateArtifactHandler', () => {
  it('updates an existing artifact', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await updateArtifactHandler(
      { artifactId: 'artifact-1', about: 'Updated description' },
      ctx
    );

    expect((result as { artifactId: string }).artifactId).toBe('artifact-1');
    expect((result as { revisionVersion: number }).revisionVersion).toBe(2);
    expect(repos.artifacts.update).toHaveBeenCalledWith(
      'artifact-1',
      expect.objectContaining({ about: 'Updated description' }),
      expect.anything()
    );
  });

  it('throws when artifact not found', async () => {
    const repos = createMockRepos();
    (repos.artifacts.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ctx = createMockContext(repos);

    await expect(
      updateArtifactHandler({ artifactId: 'nonexistent' }, ctx)
    ).rejects.toThrow('Artifact not found');
  });
});

describe('updateArtifactStatusHandler', () => {
  it('updates artifact status', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await updateArtifactStatusHandler(
      { artifactId: 'artifact-1', status: 'published' },
      ctx
    );

    expect((result as { newStatus: string }).newStatus).toBe('published');
    expect(repos.artifacts.updateStatus).toHaveBeenCalledWith('artifact-1', 'published', 'node-1');
  });
});

// --- Episode Handler Tests ---

describe('createEpisodeHandler', () => {
  it('creates an episode with required fields', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createEpisodeHandler(
      {
        title: 'Sleep Improvement',
        kind: 'regulatory',
        variables: [{ variableId: 'sleep-quality', intent: 'stabilize' }],
      },
      ctx
    );

    expect((result as { episodeId: string }).episodeId).toBeDefined();
    expect((result as { status: string }).status).toBe('planned');
    expect(repos.episodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        title: 'Sleep Improvement',
        status: 'planned',
        kind: 'regulatory',
      })
    );
  });
});

describe('updateEpisodeStatusHandler', () => {
  it('updates episode status', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await updateEpisodeStatusHandler(
      { episodeId: 'episode-1', status: 'active' },
      ctx
    );

    expect((result as { newStatus: string }).newStatus).toBe('active');
    expect(repos.episodes.updateStatus).toHaveBeenCalledWith('episode-1', 'active');
  });
});

// --- Entity Handler Tests ---

describe('createEntityHandler', () => {
  it('creates an entity', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createEntityHandler(
      { typeId: 'song', initialState: { title: 'My Song' } },
      ctx
    );

    expect((result as { entityId: string }).entityId).toBeDefined();
    expect((result as { typeId: string }).typeId).toBe('song');
    expect(repos.entities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        typeId: 'song',
        initialState: { title: 'My Song' },
      }),
      'node-1'
    );
  });
});

describe('createEntityEventHandler', () => {
  it('appends an event to an entity', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createEntityEventHandler(
      {
        entityId: 'entity-1',
        event: { type: 'status_changed', data: { status: 'completed' } },
      },
      ctx
    );

    expect((result as { entityId: string }).entityId).toBe('entity-1');
    expect((result as { eventType: string }).eventType).toBe('status_changed');
    expect(repos.entities.appendEvent).toHaveBeenCalledWith(
      'entity-1',
      expect.objectContaining({
        type: 'status_changed',
        data: { status: 'completed' },
        actorNodeId: 'node-1',
      })
    );
  });
});

// --- Variable Handler Tests ---

describe('createVariableHandler', () => {
  it('creates a variable', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createVariableHandler(
      {
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
        unit: 'hours',
        viableRange: { min: 5, max: 10 },
        preferredRange: { min: 7, max: 9 },
      },
      ctx
    );

    expect((result as { variableId: string }).variableId).toBeDefined();
    expect((result as { key: string }).key).toBe('sleep_quality');
    expect(repos.variables.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
      })
    );
  });
});

// --- Grant Handler Tests ---

describe('createGrantHandler', () => {
  it('creates a grant', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await createGrantHandler(
      {
        granteeNodeId: 'node-2',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'write'],
      },
      ctx
    );

    expect((result as { grantId: string }).grantId).toBeDefined();
    expect((result as { granteeNodeId: string }).granteeNodeId).toBe('node-2');
    expect((result as { scopes: string[] }).scopes).toEqual(['read', 'write']);
    expect(repos.grants.create).toHaveBeenCalledWith(
      expect.objectContaining({
        grantorNodeId: 'node-1',
        granteeNodeId: 'node-2',
      })
    );
  });
});

describe('revokeGrantHandler', () => {
  it('revokes a grant', async () => {
    const repos = createMockRepos();
    const ctx = createMockContext(repos);

    const result = await revokeGrantHandler(
      { grantId: 'grant-1' },
      ctx
    );

    expect((result as { grantId: string }).grantId).toBe('grant-1');
    expect((result as { revoked: boolean }).revoked).toBe(true);
    expect(repos.grants.revoke).toHaveBeenCalledWith('grant-1', expect.objectContaining({
      revokedBy: 'node-1',
    }));
  });
});

// --- Risk Level Tests ---

describe('action risk levels', () => {
  it('has correct risk levels for each action type', () => {
    const riskLevels = Object.fromEntries(
      coreActionDefinitions.map(d => [d.actionType, d.riskLevel])
    );

    // Low risk - content creation/editing
    expect(riskLevels.create_artifact).toBe('low');
    expect(riskLevels.update_artifact).toBe('low');
    expect(riskLevels.create_entity).toBe('low');
    expect(riskLevels.create_entity_event).toBe('low');

    // Medium risk - affects system behavior
    expect(riskLevels.update_artifact_status).toBe('medium');
    expect(riskLevels.create_episode).toBe('medium');
    expect(riskLevels.update_episode_status).toBe('medium');
    expect(riskLevels.create_variable).toBe('medium');

    // High risk - access control
    expect(riskLevels.create_grant).toBe('high');
    expect(riskLevels.revoke_grant).toBe('high');
  });
});
