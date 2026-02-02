// Tests for Access Checker (Phase 7.2)
// Verifies access checking scenarios including grants, edges, and approval authority.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Node,
  Grant,
  ResourceType,
  GrantScope,
  AgentDelegation,
} from '@omnilith/protocol';
import type { RepositoryContext, GrantFilter } from '@omnilith/repositories';
import {
  AccessChecker,
  createAccessChecker,
  impliesRead,
  impliesWrite,
  impliesAdmin,
  getImpliedScopes,
  deriveGrantsFromEdges,
} from './checker.js';

// --- Mock Repository Factory ---

function createMockRepos(): RepositoryContext {
  const grants = new Map<string, Grant>();
  const nodes = new Map<string, Node>();
  const delegations = new Map<string, AgentDelegation>();

  const mockGrantRepo = {
    create: vi.fn(async (input) => {
      const id = input.id ?? `grant-${grants.size + 1}`;
      const grant: Grant = {
        id,
        granteeNodeId: input.granteeNodeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        scopes: input.scopes,
        grantorNodeId: input.grantorNodeId,
        grantedAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
      };
      grants.set(id, grant);
      return grant;
    }),

    get: vi.fn(async (id: string) => grants.get(id) ?? null),

    query: vi.fn(async (filter: GrantFilter) => {
      let result = Array.from(grants.values());

      if (filter.granteeNodeId) {
        result = result.filter((g) => g.granteeNodeId === filter.granteeNodeId);
      }
      if (filter.resourceType) {
        result = result.filter((g) => g.resourceType === filter.resourceType);
      }
      if (filter.resourceId) {
        result = result.filter(
          (g) => g.resourceId === filter.resourceId || g.resourceId === '*'
        );
      }
      if (!filter.includeRevoked) {
        result = result.filter((g) => !g.revoked);
      }
      if (!filter.includeExpired) {
        const now = new Date();
        result = result.filter(
          (g) => !g.expiresAt || new Date(g.expiresAt) > now
        );
      }
      if (filter.scope) {
        result = result.filter((g) => g.scopes.includes(filter.scope!));
      }

      return result;
    }),

    hasAccess: vi.fn(
      async (
        granteeNodeId: string,
        resourceType: ResourceType,
        resourceId: string,
        scope: GrantScope
      ) => {
        const activeGrants = await mockGrantRepo.query({
          granteeNodeId,
          resourceType,
          resourceId,
          scope,
          includeRevoked: false,
          includeExpired: false,
        });
        return activeGrants.length > 0;
      }
    ),

    revoke: vi.fn(),
    getForGrantee: vi.fn(),
    getForResource: vi.fn(),
    getByGrantor: vi.fn(),
    getGrantedScopes: vi.fn(),
  };

  const mockNodeRepo = {
    get: vi.fn(async (id: string) => nodes.get(id) ?? null),
    create: vi.fn(async (input) => {
      const node: Node = {
        id: input.id ?? `node-${nodes.size + 1}`,
        kind: input.kind,
        name: input.name,
        edges: input.edges ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      nodes.set(node.id, node);
      return node;
    }),
    getAgentDelegation: vi.fn(async (agentNodeId: string) => {
      return delegations.get(agentNodeId) ?? null;
    }),
    list: vi.fn(),
    update: vi.fn(),
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
    query: vi.fn(),
  };

  // Helper to set up test data
  (mockNodeRepo as unknown as { _setNode: (node: Node) => void })._setNode = (node: Node) => {
    nodes.set(node.id, node);
  };

  (mockNodeRepo as unknown as { _setDelegation: (d: AgentDelegation) => void })._setDelegation = (
    d: AgentDelegation
  ) => {
    delegations.set(d.agentNodeId, d);
  };

  return {
    grants: mockGrantRepo,
    nodes: mockNodeRepo,
    // Other repos not needed for access tests
    observations: {} as RepositoryContext['observations'],
    artifacts: {} as RepositoryContext['artifacts'],
    variables: {} as RepositoryContext['variables'],
    episodes: {} as RepositoryContext['episodes'],
    policies: {} as RepositoryContext['policies'],
    actionRuns: {} as RepositoryContext['actionRuns'],
    surfaces: {} as RepositoryContext['surfaces'],
    entities: {} as RepositoryContext['entities'],
  } as unknown as RepositoryContext;
}

// --- Tests ---

describe('AccessChecker', () => {
  let repos: ReturnType<typeof createMockRepos>;
  let checker: AccessChecker;

  beforeEach(() => {
    repos = createMockRepos();
    checker = createAccessChecker(repos);
  });

  // --- Basic Access Tests ---

  describe('checkAccess', () => {
    it('allows access when explicit grant exists', async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner',
      });

      const result = await checker.checkAccess({
        actorNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scope: 'read',
      });

      expect(result.allowed).toBe(true);
      expect(result.grants.length).toBeGreaterThan(0);
    });

    it('denies access when no grant exists', async () => {
      const result = await checker.checkAccess({
        actorNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scope: 'read',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No grant found');
    });

    it('denies access when scope not granted', async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner',
      });

      const result = await checker.checkAccess({
        actorNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scope: 'write', // Not granted
      });

      expect(result.allowed).toBe(false);
    });

    it('allows self-access to own node', async () => {
      const result = await checker.checkAccess({
        actorNodeId: 'my-node',
        resourceType: 'node',
        resourceId: 'my-node',
        scope: 'read',
      });

      expect(result.allowed).toBe(true);
      expect(result.grants).toHaveLength(0); // No explicit grant needed
    });

    it('allows access via wildcard grant', async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'admin',
      });

      const result = await checker.checkAccess({
        actorNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'any-artifact',
        scope: 'read',
      });

      expect(result.allowed).toBe(true);
    });

    it('allows owner access to their resources', async () => {
      const result = await checker.checkAccess({
        actorNodeId: 'owner-node',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scope: 'write',
        ownerNodeId: 'owner-node',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // --- Edge-Based Access Tests ---

  describe('checkAccess with edge grants', () => {
    beforeEach(() => {
      // Set up nodes with edges
      const setNode = (
        repos.nodes as unknown as { _setNode: (node: Node) => void }
      )._setNode;

      setNode({
        id: 'follower-node',
        kind: 'subject',
        name: 'Follower',
        edges: [
          {
            id: 'edge-1',
            fromNodeId: 'follower-node',
            toNodeId: 'followed-node',
            type: 'follows',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'followed-node',
        kind: 'subject',
        name: 'Followed',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'maintainer-node',
        kind: 'subject',
        name: 'Maintainer',
        edges: [
          {
            id: 'edge-2',
            fromNodeId: 'maintainer-node',
            toNodeId: 'project-node',
            type: 'maintains',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'project-node',
        kind: 'object',
        name: 'Project',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('denies edge-based access by default', async () => {
      const result = await checker.checkAccess({
        actorNodeId: 'follower-node',
        resourceType: 'node',
        resourceId: 'followed-node',
        scope: 'read',
      });

      expect(result.allowed).toBe(false);
    });

    it('allows read access via follows edge when enabled', async () => {
      const result = await checker.checkAccess(
        {
          actorNodeId: 'follower-node',
          resourceType: 'node',
          resourceId: 'followed-node',
          scope: 'read',
        },
        { includeEdgeGrants: true }
      );

      expect(result.allowed).toBe(true);
    });

    it('allows write access via maintains edge when enabled', async () => {
      const result = await checker.checkAccess(
        {
          actorNodeId: 'maintainer-node',
          resourceType: 'node',
          resourceId: 'project-node',
          scope: 'write',
        },
        { includeEdgeGrants: true }
      );

      expect(result.allowed).toBe(true);
    });

    it('denies write access via follows edge', async () => {
      const result = await checker.checkAccess(
        {
          actorNodeId: 'follower-node',
          resourceType: 'node',
          resourceId: 'followed-node',
          scope: 'write',
        },
        { includeEdgeGrants: true }
      );

      expect(result.allowed).toBe(false);
    });

    it('respects custom edge type mappings', async () => {
      const result = await checker.checkAccess(
        {
          actorNodeId: 'follower-node',
          resourceType: 'node',
          resourceId: 'followed-node',
          scope: 'write',
        },
        {
          includeEdgeGrants: true,
          writeEdgeTypes: ['follows'], // Custom: follows implies write
        }
      );

      expect(result.allowed).toBe(true);
    });
  });

  // --- Multiple Scopes Tests ---

  describe('checkScopes', () => {
    beforeEach(async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read', 'observe'],
        grantorNodeId: 'owner',
      });
    });

    it('returns granted and denied scopes', async () => {
      const result = await checker.checkScopes(
        'viewer',
        'artifact',
        'doc-1',
        ['read', 'write', 'observe', 'admin']
      );

      expect(result.grantedScopes).toContain('read');
      expect(result.grantedScopes).toContain('observe');
      expect(result.deniedScopes).toContain('write');
      expect(result.deniedScopes).toContain('admin');
      expect(result.allGranted).toBe(false);
    });

    it('returns allGranted true when all scopes granted', async () => {
      const result = await checker.checkScopes('viewer', 'artifact', 'doc-1', [
        'read',
        'observe',
      ]);

      expect(result.allGranted).toBe(true);
      expect(result.deniedScopes).toHaveLength(0);
    });
  });

  // --- Approval Authority Tests ---

  describe('canApprove', () => {
    beforeEach(() => {
      const setNode = (
        repos.nodes as unknown as { _setNode: (node: Node) => void }
      )._setNode;

      setNode({
        id: 'subject-node',
        kind: 'subject',
        name: 'Subject',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'agent-node',
        kind: 'agent',
        name: 'Agent',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'object-node',
        kind: 'object',
        name: 'Object',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setNode({
        id: 'target-node',
        kind: 'object',
        name: 'Target',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('allows subject to approve within their own node', async () => {
      const result = await checker.canApprove('subject-node', 'subject-node', 'high');

      expect(result.allowed).toBe(true);
    });

    it('allows subject to approve with grant', async () => {
      await repos.grants.create({
        granteeNodeId: 'subject-node',
        resourceType: 'node',
        resourceId: 'target-node',
        scopes: ['approve'],
        grantorNodeId: 'target-node',
      });

      const result = await checker.canApprove('subject-node', 'target-node', 'medium');

      expect(result.allowed).toBe(true);
    });

    it('denies agent for high risk without delegation', async () => {
      const result = await checker.canApprove('agent-node', 'target-node', 'high');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('require Subject-Node approval');
    });

    it('denies agent for critical risk', async () => {
      const setDelegation = (
        repos.nodes as unknown as {
          _setDelegation: (d: AgentDelegation) => void;
        }
      )._setDelegation;

      setDelegation({
        agentNodeId: 'agent-node',
        sponsorNodeId: 'subject-node',
        grantedAt: new Date().toISOString(),
        scopes: ['approve'],
      });

      const result = await checker.canApprove('agent-node', 'target-node', 'critical');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('require Subject-Node approval');
    });

    it('allows agent with valid delegation for low risk', async () => {
      const setDelegation = (
        repos.nodes as unknown as {
          _setDelegation: (d: AgentDelegation) => void;
        }
      )._setDelegation;

      setDelegation({
        agentNodeId: 'agent-node',
        sponsorNodeId: 'subject-node',
        grantedAt: new Date().toISOString(),
        scopes: ['approve'],
      });

      const result = await checker.canApprove('agent-node', 'target-node', 'low');

      expect(result.allowed).toBe(true);
    });

    it('denies agent with expired delegation', async () => {
      const setDelegation = (
        repos.nodes as unknown as {
          _setDelegation: (d: AgentDelegation) => void;
        }
      )._setDelegation;

      setDelegation({
        agentNodeId: 'agent-node',
        sponsorNodeId: 'subject-node',
        grantedAt: new Date().toISOString(),
        scopes: ['approve'],
        constraints: {
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // Expired
        },
      });

      const result = await checker.canApprove('agent-node', 'target-node', 'low');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('denies agent exceeding maxRiskLevel', async () => {
      const setDelegation = (
        repos.nodes as unknown as {
          _setDelegation: (d: AgentDelegation) => void;
        }
      )._setDelegation;

      setDelegation({
        agentNodeId: 'agent-node',
        sponsorNodeId: 'subject-node',
        grantedAt: new Date().toISOString(),
        scopes: ['approve'],
        constraints: {
          maxRiskLevel: 'low',
        },
      });

      const result = await checker.canApprove('agent-node', 'target-node', 'medium');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('only approve up to');
    });

    it('denies agent without approve scope', async () => {
      const setDelegation = (
        repos.nodes as unknown as {
          _setDelegation: (d: AgentDelegation) => void;
        }
      )._setDelegation;

      setDelegation({
        agentNodeId: 'agent-node',
        sponsorNodeId: 'subject-node',
        grantedAt: new Date().toISOString(),
        scopes: ['observe', 'propose'], // No 'approve'
      });

      const result = await checker.canApprove('agent-node', 'target-node', 'low');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not include approve');
    });

    it('denies object node approval', async () => {
      const result = await checker.canApprove('object-node', 'target-node', 'low');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Object nodes cannot approve');
    });
  });

  // --- Resource Queries ---

  describe('getAccessibleResources', () => {
    beforeEach(async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner',
      });
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'artifact',
        resourceId: 'doc-2',
        scopes: ['read', 'write'],
        grantorNodeId: 'owner',
      });
      await repos.grants.create({
        granteeNodeId: 'viewer',
        resourceType: 'surface',
        resourceId: 'surface-1',
        scopes: ['read'],
        grantorNodeId: 'owner',
      });
    });

    it('returns all accessible resources of a type', async () => {
      const grants = await checker.getAccessibleResources('viewer', 'artifact');

      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.resourceType === 'artifact')).toBe(true);
    });

    it('filters by scope', async () => {
      const grants = await checker.getAccessibleResources('viewer', 'artifact', 'write');

      expect(grants).toHaveLength(1);
      expect(grants[0].resourceId).toBe('doc-2');
    });
  });

  describe('getResourceAccessors', () => {
    beforeEach(async () => {
      await repos.grants.create({
        granteeNodeId: 'viewer-1',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner',
      });
      await repos.grants.create({
        granteeNodeId: 'viewer-2',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read', 'write'],
        grantorNodeId: 'owner',
      });
    });

    it('returns all nodes with access to a resource', async () => {
      const grants = await checker.getResourceAccessors('artifact', 'doc-1');

      expect(grants).toHaveLength(2);
      const grantees = grants.map((g) => g.granteeNodeId);
      expect(grantees).toContain('viewer-1');
      expect(grantees).toContain('viewer-2');
    });

    it('filters by scope', async () => {
      const grants = await checker.getResourceAccessors('artifact', 'doc-1', 'write');

      expect(grants).toHaveLength(1);
      expect(grants[0].granteeNodeId).toBe('viewer-2');
    });
  });
});

// --- Utility Function Tests ---

describe('Utility Functions', () => {
  describe('impliesRead', () => {
    it('returns true for read, admin, observe', () => {
      expect(impliesRead('read')).toBe(true);
      expect(impliesRead('admin')).toBe(true);
      expect(impliesRead('observe')).toBe(true);
    });

    it('returns false for write, propose, approve', () => {
      expect(impliesRead('write')).toBe(false);
      expect(impliesRead('propose')).toBe(false);
      expect(impliesRead('approve')).toBe(false);
    });
  });

  describe('impliesWrite', () => {
    it('returns true for write, admin', () => {
      expect(impliesWrite('write')).toBe(true);
      expect(impliesWrite('admin')).toBe(true);
    });

    it('returns false for read, observe', () => {
      expect(impliesWrite('read')).toBe(false);
      expect(impliesWrite('observe')).toBe(false);
    });
  });

  describe('impliesAdmin', () => {
    it('returns true only for admin', () => {
      expect(impliesAdmin('admin')).toBe(true);
      expect(impliesAdmin('read')).toBe(false);
      expect(impliesAdmin('write')).toBe(false);
    });
  });

  describe('getImpliedScopes', () => {
    it('admin implies read and write', () => {
      const scopes = getImpliedScopes('admin');
      expect(scopes).toContain('admin');
      expect(scopes).toContain('read');
      expect(scopes).toContain('write');
    });

    it('read only implies read', () => {
      const scopes = getImpliedScopes('read');
      expect(scopes).toEqual(['read']);
    });

    it('returns custom scope unchanged', () => {
      const scopes = getImpliedScopes('custom:scope');
      expect(scopes).toEqual(['custom:scope']);
    });
  });

  describe('deriveGrantsFromEdges', () => {
    it('derives grants from edges based on mapping', () => {
      const node: Node = {
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        edges: [
          {
            id: 'edge-1',
            fromNodeId: 'node-1',
            toNodeId: 'node-2',
            type: 'follows',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'edge-2',
            fromNodeId: 'node-1',
            toNodeId: 'node-3',
            type: 'maintains',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const grants = deriveGrantsFromEdges(node, {
        follows: ['read'],
        maintains: ['read', 'write'],
      });

      expect(grants).toHaveLength(2);

      const node2Grant = grants.find((g) => g.toNodeId === 'node-2');
      expect(node2Grant?.scopes).toEqual(['read']);

      const node3Grant = grants.find((g) => g.toNodeId === 'node-3');
      expect(node3Grant?.scopes).toContain('read');
      expect(node3Grant?.scopes).toContain('write');
    });

    it('merges scopes for multiple edges to same node', () => {
      const node: Node = {
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        edges: [
          {
            id: 'edge-1',
            fromNodeId: 'node-1',
            toNodeId: 'node-2',
            type: 'follows',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'edge-2',
            fromNodeId: 'node-1',
            toNodeId: 'node-2',
            type: 'maintains',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const grants = deriveGrantsFromEdges(node, {
        follows: ['read'],
        maintains: ['write'],
      });

      expect(grants).toHaveLength(1);
      expect(grants[0].toNodeId).toBe('node-2');
      expect(grants[0].scopes).toContain('read');
      expect(grants[0].scopes).toContain('write');
    });

    it('ignores edges not in mapping', () => {
      const node: Node = {
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        edges: [
          {
            id: 'edge-1',
            fromNodeId: 'node-1',
            toNodeId: 'node-2',
            type: 'feeds',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const grants = deriveGrantsFromEdges(node, {
        follows: ['read'],
        maintains: ['write'],
      });

      expect(grants).toHaveLength(0);
    });

    it('returns empty for node with no edges', () => {
      const node: Node = {
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const grants = deriveGrantsFromEdges(node, {
        follows: ['read'],
      });

      expect(grants).toHaveLength(0);
    });
  });
});
