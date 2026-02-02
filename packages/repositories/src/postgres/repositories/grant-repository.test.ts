// Tests for Grant Repository (Phase 7.1)
// Verifies grant lifecycle: creation, revocation, queries, and access checking.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Grant, ResourceType, GrantScope } from '@omnilith/protocol';
import type {
  GrantRepository,
  CreateGrantInput,
  GrantFilter,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemoryGrantRepository(): GrantRepository & { clear(): void } {
  const grants = new Map<string, Grant>();

  return {
    async create(input: CreateGrantInput): Promise<Grant> {
      const id = input.id ?? `grant-${grants.size + 1}`;
      const now = new Date().toISOString();

      const grant: Grant = {
        id,
        granteeNodeId: input.granteeNodeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        scopes: input.scopes,
        grantorNodeId: input.grantorNodeId,
        grantedAt: now,
        expiresAt: input.expiresAt,
      };
      grants.set(id, grant);
      return grant;
    },

    async get(id: string): Promise<Grant | null> {
      return grants.get(id) ?? null;
    },

    async query(filter: GrantFilter): Promise<Grant[]> {
      let result = Array.from(grants.values());

      if (filter.granteeNodeId) {
        result = result.filter((g) => g.granteeNodeId === filter.granteeNodeId);
      }
      if (filter.grantorNodeId) {
        result = result.filter((g) => g.grantorNodeId === filter.grantorNodeId);
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
      if (filter.offset) {
        result = result.slice(filter.offset);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async revoke(
      id: string,
      revocation: { revokedBy: string; reason?: string }
    ): Promise<Grant | null> {
      const grant = grants.get(id);
      if (!grant) return null;

      const updated: Grant = {
        ...grant,
        revoked: {
          revokedAt: new Date().toISOString(),
          revokedBy: revocation.revokedBy,
          reason: revocation.reason,
        },
      };
      grants.set(id, updated);
      return updated;
    },

    async hasAccess(
      granteeNodeId: string,
      resourceType: ResourceType,
      resourceId: string | '*',
      scope: GrantScope
    ): Promise<boolean> {
      const activeGrants = await this.query({
        granteeNodeId,
        resourceType,
        resourceId,
        scope,
        includeRevoked: false,
        includeExpired: false,
      });
      return activeGrants.length > 0;
    },

    async getForGrantee(granteeNodeId: string): Promise<Grant[]> {
      return this.query({
        granteeNodeId,
        includeRevoked: false,
        includeExpired: false,
      });
    },

    async getForResource(
      resourceType: ResourceType,
      resourceId: string
    ): Promise<Grant[]> {
      return this.query({
        resourceType,
        resourceId,
        includeRevoked: false,
        includeExpired: false,
      });
    },

    async getByGrantor(grantorNodeId: string): Promise<Grant[]> {
      return this.query({
        grantorNodeId,
        includeRevoked: false,
        includeExpired: false,
      });
    },

    async getGrantedScopes(
      granteeNodeId: string,
      resourceType: ResourceType,
      resourceId: string
    ): Promise<GrantScope[]> {
      const activeGrants = await this.query({
        granteeNodeId,
        resourceType,
        resourceId,
        includeRevoked: false,
        includeExpired: false,
      });

      const scopes = new Set<GrantScope>();
      for (const grant of activeGrants) {
        for (const scope of grant.scopes) {
          scopes.add(scope);
        }
      }
      return Array.from(scopes);
    },

    clear() {
      grants.clear();
    },
  };
}

// --- Tests ---

describe('GrantRepository', () => {
  let repo: ReturnType<typeof createInMemoryGrantRepository>;

  beforeEach(() => {
    repo = createInMemoryGrantRepository();
  });

  // --- Create Tests ---

  describe('create', () => {
    it('creates a grant with minimal required fields', async () => {
      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      expect(grant.id).toBeDefined();
      expect(grant.granteeNodeId).toBe('node-1');
      expect(grant.resourceType).toBe('artifact');
      expect(grant.resourceId).toBe('artifact-1');
      expect(grant.scopes).toEqual(['read']);
      expect(grant.grantorNodeId).toBe('node-2');
      expect(grant.grantedAt).toBeDefined();
      expect(grant.revoked).toBeUndefined();
    });

    it('creates a grant with multiple scopes', async () => {
      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'write', 'admin'],
        grantorNodeId: 'node-2',
      });

      expect(grant.scopes).toEqual(['read', 'write', 'admin']);
    });

    it('creates a grant with wildcard resource ID', async () => {
      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      expect(grant.resourceId).toBe('*');
    });

    it('creates a grant with expiration', async () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();

      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
        expiresAt,
      });

      expect(grant.expiresAt).toBe(expiresAt);
    });

    it('uses provided id when specified', async () => {
      const grant = await repo.create({
        id: 'custom-grant-id',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      expect(grant.id).toBe('custom-grant-id');
    });

    it('supports all resource types', async () => {
      const resourceTypes: ResourceType[] = [
        'node',
        'artifact',
        'surface',
        'entity',
        'variable',
        'episode',
      ];

      for (const resourceType of resourceTypes) {
        const grant = await repo.create({
          granteeNodeId: 'node-1',
          resourceType,
          resourceId: 'resource-1',
          scopes: ['read'],
          grantorNodeId: 'node-2',
        });

        expect(grant.resourceType).toBe(resourceType);
      }
    });

    it('supports all standard scopes', async () => {
      const scopes: GrantScope[] = [
        'read',
        'write',
        'admin',
        'observe',
        'propose',
        'approve',
      ];

      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'node',
        resourceId: 'node-2',
        scopes,
        grantorNodeId: 'node-2',
      });

      expect(grant.scopes).toEqual(scopes);
    });

    it('supports custom scopes', async () => {
      const grant = await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'custom:export', 'custom:share'],
        grantorNodeId: 'node-2',
      });

      expect(grant.scopes).toContain('custom:export');
      expect(grant.scopes).toContain('custom:share');
    });
  });

  // --- Get Tests ---

  describe('get', () => {
    it('returns a grant by id', async () => {
      const created = await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      const retrieved = await repo.get('grant-1');

      expect(retrieved).toEqual(created);
    });

    it('returns null for non-existent grant', async () => {
      const result = await repo.get('non-existent');

      expect(result).toBeNull();
    });
  });

  // --- Revoke Tests ---

  describe('revoke', () => {
    it('revokes a grant', async () => {
      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      const revoked = await repo.revoke('grant-1', {
        revokedBy: 'node-2',
        reason: 'Access no longer needed',
      });

      expect(revoked?.revoked).toBeDefined();
      expect(revoked?.revoked?.revokedBy).toBe('node-2');
      expect(revoked?.revoked?.reason).toBe('Access no longer needed');
      expect(revoked?.revoked?.revokedAt).toBeDefined();
    });

    it('revokes a grant without reason', async () => {
      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      const revoked = await repo.revoke('grant-1', {
        revokedBy: 'node-2',
      });

      expect(revoked?.revoked).toBeDefined();
      expect(revoked?.revoked?.reason).toBeUndefined();
    });

    it('returns null when revoking non-existent grant', async () => {
      const result = await repo.revoke('non-existent', {
        revokedBy: 'node-1',
      });

      expect(result).toBeNull();
    });

    it('excludes revoked grants from default queries', async () => {
      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      await repo.revoke('grant-1', { revokedBy: 'node-2' });

      const results = await repo.query({ granteeNodeId: 'node-1' });

      expect(results).toHaveLength(0);
    });

    it('includes revoked grants when requested', async () => {
      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
      });

      await repo.revoke('grant-1', { revokedBy: 'node-2' });

      const results = await repo.query({
        granteeNodeId: 'node-1',
        includeRevoked: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].revoked).toBeDefined();
    });
  });

  // --- Query Tests ---

  describe('query', () => {
    beforeEach(async () => {
      // Create various grants for testing
      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        id: 'grant-2',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-2',
        scopes: ['read', 'write'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        id: 'grant-3',
        granteeNodeId: 'node-2',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        id: 'grant-4',
        granteeNodeId: 'node-1',
        resourceType: 'surface',
        resourceId: 'surface-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        id: 'grant-5',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'node-owner',
      });
    });

    it('returns all grants when no filter', async () => {
      const result = await repo.query({});

      expect(result).toHaveLength(5);
    });

    it('filters by granteeNodeId', async () => {
      const result = await repo.query({ granteeNodeId: 'node-1' });

      expect(result).toHaveLength(4);
      expect(result.every((g) => g.granteeNodeId === 'node-1')).toBe(true);
    });

    it('filters by grantorNodeId', async () => {
      const result = await repo.query({ grantorNodeId: 'node-owner' });

      expect(result).toHaveLength(1);
      expect(result[0].grantorNodeId).toBe('node-owner');
    });

    it('filters by resourceType', async () => {
      const result = await repo.query({ resourceType: 'artifact' });

      expect(result).toHaveLength(4);
      expect(result.every((g) => g.resourceType === 'artifact')).toBe(true);
    });

    it('filters by resourceId including wildcard matches', async () => {
      const result = await repo.query({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
      });

      // Should include both specific grant and wildcard grant
      expect(result).toHaveLength(2);
      const resourceIds = result.map((g) => g.resourceId);
      expect(resourceIds).toContain('artifact-1');
      expect(resourceIds).toContain('*');
    });

    it('filters by scope', async () => {
      const result = await repo.query({ scope: 'write' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('grant-2');
    });

    it('applies limit', async () => {
      const result = await repo.query({ limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('applies offset', async () => {
      const result = await repo.query({ offset: 3 });

      expect(result).toHaveLength(2);
    });

    it('combines multiple filters', async () => {
      const result = await repo.query({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        scope: 'read',
      });

      expect(result).toHaveLength(3);
    });
  });

  // --- Expiration Tests ---

  describe('expiration', () => {
    it('excludes expired grants from default queries', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
        expiresAt: pastDate,
      });

      const results = await repo.query({ granteeNodeId: 'node-1' });

      expect(results).toHaveLength(0);
    });

    it('includes expired grants when requested', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
        expiresAt: pastDate,
      });

      const results = await repo.query({
        granteeNodeId: 'node-1',
        includeExpired: true,
      });

      expect(results).toHaveLength(1);
    });

    it('includes non-expired grants in default queries', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();

      await repo.create({
        id: 'grant-1',
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-2',
        expiresAt: futureDate,
      });

      const results = await repo.query({ granteeNodeId: 'node-1' });

      expect(results).toHaveLength(1);
    });
  });

  // --- hasAccess Tests ---

  describe('hasAccess', () => {
    beforeEach(async () => {
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'write'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'node-owner',
      });
    });

    it('returns true when specific grant exists', async () => {
      const hasAccess = await repo.hasAccess(
        'node-1',
        'artifact',
        'artifact-1',
        'read'
      );

      expect(hasAccess).toBe(true);
    });

    it('returns true when wildcard grant covers resource', async () => {
      const hasAccess = await repo.hasAccess(
        'node-1',
        'artifact',
        'artifact-99',
        'read'
      );

      expect(hasAccess).toBe(true);
    });

    it('returns false when no grant exists', async () => {
      const hasAccess = await repo.hasAccess(
        'node-2',
        'artifact',
        'artifact-1',
        'read'
      );

      expect(hasAccess).toBe(false);
    });

    it('returns false when scope not granted', async () => {
      const hasAccess = await repo.hasAccess(
        'node-1',
        'artifact',
        'artifact-1',
        'admin'
      );

      expect(hasAccess).toBe(false);
    });

    it('returns false for revoked grants', async () => {
      const grant = await repo.create({
        granteeNodeId: 'node-3',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });

      await repo.revoke(grant.id, { revokedBy: 'node-admin' });

      const hasAccess = await repo.hasAccess(
        'node-3',
        'artifact',
        'artifact-1',
        'read'
      );

      expect(hasAccess).toBe(false);
    });

    it('returns false for expired grants', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      await repo.create({
        granteeNodeId: 'node-4',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
        expiresAt: pastDate,
      });

      const hasAccess = await repo.hasAccess(
        'node-4',
        'artifact',
        'artifact-1',
        'read'
      );

      expect(hasAccess).toBe(false);
    });
  });

  // --- Convenience Query Tests ---

  describe('getForGrantee', () => {
    beforeEach(async () => {
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'surface',
        resourceId: 'surface-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-2',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
    });

    it('returns all active grants for a grantee', async () => {
      const grants = await repo.getForGrantee('node-1');

      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.granteeNodeId === 'node-1')).toBe(true);
    });

    it('returns empty array for node with no grants', async () => {
      const grants = await repo.getForGrantee('node-unknown');

      expect(grants).toEqual([]);
    });
  });

  describe('getForResource', () => {
    beforeEach(async () => {
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-2',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'write'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-3',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'node-owner',
      });
    });

    it('returns all active grants for a resource (including wildcard)', async () => {
      const grants = await repo.getForResource('artifact', 'artifact-1');

      // Should include specific grants and wildcard grants
      expect(grants).toHaveLength(3);
    });

    it('returns empty array for resource with no grants', async () => {
      const grants = await repo.getForResource('surface', 'surface-unknown');

      expect(grants).toEqual([]);
    });
  });

  describe('getByGrantor', () => {
    beforeEach(async () => {
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-2',
        resourceType: 'artifact',
        resourceId: 'artifact-2',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-3',
        resourceType: 'surface',
        resourceId: 'surface-1',
        scopes: ['read'],
        grantorNodeId: 'node-owner',
      });
    });

    it('returns all grants created by a grantor', async () => {
      const grants = await repo.getByGrantor('node-admin');

      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.grantorNodeId === 'node-admin')).toBe(true);
    });

    it('returns empty array for grantor with no grants', async () => {
      const grants = await repo.getByGrantor('node-unknown');

      expect(grants).toEqual([]);
    });
  });

  describe('getGrantedScopes', () => {
    beforeEach(async () => {
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read'],
        grantorNodeId: 'node-admin',
      });
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['write', 'admin'],
        grantorNodeId: 'node-owner',
      });
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['observe'],
        grantorNodeId: 'node-super',
      });
    });

    it('returns all granted scopes from multiple grants', async () => {
      const scopes = await repo.getGrantedScopes(
        'node-1',
        'artifact',
        'artifact-1'
      );

      expect(scopes).toContain('read');
      expect(scopes).toContain('write');
      expect(scopes).toContain('admin');
      expect(scopes).toContain('observe');
    });

    it('returns unique scopes', async () => {
      // Add another grant with overlapping scope
      await repo.create({
        granteeNodeId: 'node-1',
        resourceType: 'artifact',
        resourceId: 'artifact-1',
        scopes: ['read', 'write'], // Overlaps with existing grants
        grantorNodeId: 'node-extra',
      });

      const scopes = await repo.getGrantedScopes(
        'node-1',
        'artifact',
        'artifact-1'
      );

      // Count occurrences of each scope
      const scopeCounts = scopes.reduce(
        (acc, s) => {
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Each scope should appear only once
      expect(Object.values(scopeCounts).every((count) => count === 1)).toBe(
        true
      );
    });

    it('returns empty array when no grants exist', async () => {
      const scopes = await repo.getGrantedScopes(
        'node-unknown',
        'artifact',
        'artifact-1'
      );

      expect(scopes).toEqual([]);
    });
  });

  // --- Integration Tests ---

  describe('Grant lifecycle integration', () => {
    it('supports full grant lifecycle', async () => {
      // 1. Create a grant
      const grant = await repo.create({
        granteeNodeId: 'viewer-node',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read', 'write'],
        grantorNodeId: 'owner-node',
      });

      expect(grant.id).toBeDefined();

      // 2. Verify access
      let hasRead = await repo.hasAccess(
        'viewer-node',
        'artifact',
        'doc-1',
        'read'
      );
      expect(hasRead).toBe(true);

      // 3. Query grants
      const viewerGrants = await repo.getForGrantee('viewer-node');
      expect(viewerGrants).toHaveLength(1);

      const docGrants = await repo.getForResource('artifact', 'doc-1');
      expect(docGrants).toHaveLength(1);

      // 4. Get scopes
      const scopes = await repo.getGrantedScopes(
        'viewer-node',
        'artifact',
        'doc-1'
      );
      expect(scopes).toContain('read');
      expect(scopes).toContain('write');

      // 5. Revoke grant
      await repo.revoke(grant.id, {
        revokedBy: 'owner-node',
        reason: 'Project completed',
      });

      // 6. Verify access revoked
      hasRead = await repo.hasAccess(
        'viewer-node',
        'artifact',
        'doc-1',
        'read'
      );
      expect(hasRead).toBe(false);

      // 7. Grant still exists in history
      const revokedGrant = await repo.get(grant.id);
      expect(revokedGrant?.revoked).toBeDefined();
      expect(revokedGrant?.revoked?.reason).toBe('Project completed');
    });

    it('supports hierarchical access with wildcards', async () => {
      // Grant read access to all artifacts
      await repo.create({
        granteeNodeId: 'viewer-node',
        resourceType: 'artifact',
        resourceId: '*',
        scopes: ['read'],
        grantorNodeId: 'admin-node',
      });

      // Grant write access to specific artifact
      await repo.create({
        granteeNodeId: 'viewer-node',
        resourceType: 'artifact',
        resourceId: 'special-doc',
        scopes: ['write'],
        grantorNodeId: 'owner-node',
      });

      // Verify wildcard read access
      const hasReadAny = await repo.hasAccess(
        'viewer-node',
        'artifact',
        'random-artifact',
        'read'
      );
      expect(hasReadAny).toBe(true);

      // Verify specific write access
      const hasWriteSpecial = await repo.hasAccess(
        'viewer-node',
        'artifact',
        'special-doc',
        'write'
      );
      expect(hasWriteSpecial).toBe(true);

      // Verify no write to other artifacts
      const hasWriteOther = await repo.hasAccess(
        'viewer-node',
        'artifact',
        'other-doc',
        'write'
      );
      expect(hasWriteOther).toBe(false);
    });

    it('supports multiple grantors for same resource', async () => {
      // Admin grants read
      await repo.create({
        granteeNodeId: 'viewer-node',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'admin-node',
      });

      // Owner grants write
      await repo.create({
        granteeNodeId: 'viewer-node',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['write'],
        grantorNodeId: 'owner-node',
      });

      // Verify combined access
      const scopes = await repo.getGrantedScopes(
        'viewer-node',
        'artifact',
        'doc-1'
      );
      expect(scopes).toContain('read');
      expect(scopes).toContain('write');

      // Verify each grantor's grants
      const adminGrants = await repo.getByGrantor('admin-node');
      expect(adminGrants).toHaveLength(1);

      const ownerGrants = await repo.getByGrantor('owner-node');
      expect(ownerGrants).toHaveLength(1);
    });

    it('handles time-limited grants correctly', async () => {
      const now = Date.now();
      const pastExpiry = new Date(now - 3600000).toISOString();
      const futureExpiry = new Date(now + 3600000).toISOString();

      // Expired grant
      await repo.create({
        granteeNodeId: 'temp-viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner-node',
        expiresAt: pastExpiry,
      });

      // Active grant
      await repo.create({
        granteeNodeId: 'active-viewer',
        resourceType: 'artifact',
        resourceId: 'doc-1',
        scopes: ['read'],
        grantorNodeId: 'owner-node',
        expiresAt: futureExpiry,
      });

      // Verify expired grant doesn't provide access
      const hasExpiredAccess = await repo.hasAccess(
        'temp-viewer',
        'artifact',
        'doc-1',
        'read'
      );
      expect(hasExpiredAccess).toBe(false);

      // Verify active grant provides access
      const hasActiveAccess = await repo.hasAccess(
        'active-viewer',
        'artifact',
        'doc-1',
        'read'
      );
      expect(hasActiveAccess).toBe(true);
    });
  });
});
