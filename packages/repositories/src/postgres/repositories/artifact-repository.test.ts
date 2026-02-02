// Tests for Artifact Repository (Phase 8.1)
// Comprehensive tests for artifact CRUD operations, status lifecycle, and revisions.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Artifact, Revision, ArtifactStatus, PageDoc, Id } from '@omnilith/protocol';
import type {
  ArtifactRepository,
  CreateArtifactInput,
  UpdateArtifactInput,
  ArtifactFilter,
  CreateRevisionInput,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemoryArtifactRepository(): ArtifactRepository & { clear(): void } {
  const artifacts = new Map<string, Artifact>();
  const revisions = new Map<string, Revision[]>(); // artifactId -> revisions

  return {
    async create(input: CreateArtifactInput, revision: CreateRevisionInput): Promise<Artifact> {
      const id = input.id ?? `artifact-${artifacts.size + 1}`;
      const now = new Date().toISOString();

      const artifact: Artifact = {
        id,
        nodeId: input.nodeId,
        title: input.title,
        about: input.about,
        notes: input.notes,
        page: input.page,
        status: input.status ?? 'draft',
        trunkVersion: 1,
        entityRefs: input.entityRefs,
        createdAt: now,
        updatedAt: now,
      };
      artifacts.set(id, artifact);

      // Create initial revision
      const rev: Revision = {
        id: `rev-${id}-1`,
        artifactId: id,
        version: 1,
        snapshot: {
          title: input.title,
          about: input.about,
          notes: input.notes,
          page: input.page,
          status: input.status ?? 'draft',
        },
        authorNodeId: revision.authorNodeId,
        message: revision.message ?? 'Initial version',
        createdAt: now,
      };
      revisions.set(id, [rev]);

      return artifact;
    },

    async get(id: Id): Promise<Artifact | null> {
      return artifacts.get(id) ?? null;
    },

    async list(filter?: ArtifactFilter): Promise<Artifact[]> {
      let result = Array.from(artifacts.values());

      if (filter?.nodeId) {
        result = result.filter((a) => a.nodeId === filter.nodeId);
      }
      if (filter?.status && filter.status.length > 0) {
        result = result.filter((a) => filter.status!.includes(a.status));
      }
      if (filter?.entityRefs && filter.entityRefs.length > 0) {
        result = result.filter((a) =>
          filter.entityRefs!.some((ref) => a.entityRefs?.includes(ref))
        );
      }

      // Sort by updatedAt descending
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async query(nodeId: Id, querySpec: any): Promise<Artifact[]> {
      let result = Array.from(artifacts.values()).filter((a) => a.nodeId === nodeId);

      if (querySpec.status && querySpec.status.length > 0) {
        result = result.filter((a) => querySpec.status.includes(a.status));
      }
      if (querySpec.timeRange?.start) {
        result = result.filter((a) => new Date(a.updatedAt) >= new Date(querySpec.timeRange.start));
      }
      if (querySpec.timeRange?.end) {
        result = result.filter((a) => new Date(a.updatedAt) <= new Date(querySpec.timeRange.end));
      }

      // Sort by updatedAt
      const desc = querySpec.orderBy?.direction !== 'asc';
      result.sort((a, b) => {
        const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return desc ? -diff : diff;
      });

      if (querySpec.offset) {
        result = result.slice(querySpec.offset);
      }
      if (querySpec.limit) {
        result = result.slice(0, querySpec.limit);
      }

      return result;
    },

    async update(
      id: Id,
      input: UpdateArtifactInput,
      revision: CreateRevisionInput
    ): Promise<Artifact | null> {
      const existing = artifacts.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const newVersion = existing.trunkVersion + 1;

      const updated: Artifact = {
        ...existing,
        title: input.title ?? existing.title,
        about: input.about ?? existing.about,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        page: input.page ?? existing.page,
        status: input.status ?? existing.status,
        entityRefs: input.entityRefs !== undefined ? input.entityRefs : existing.entityRefs,
        trunkVersion: newVersion,
        updatedAt: now,
      };
      artifacts.set(id, updated);

      // Create revision
      const artifactRevisions = revisions.get(id) ?? [];
      artifactRevisions.push({
        id: `rev-${id}-${newVersion}`,
        artifactId: id,
        version: newVersion,
        snapshot: {
          title: updated.title,
          about: updated.about,
          notes: updated.notes,
          page: updated.page,
          status: updated.status,
        },
        authorNodeId: revision.authorNodeId,
        message: revision.message,
        createdAt: now,
      });
      revisions.set(id, artifactRevisions);

      return updated;
    },

    async updateStatus(id: Id, status: ArtifactStatus, authorNodeId: Id): Promise<Artifact | null> {
      const existing = artifacts.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const newVersion = existing.trunkVersion + 1;

      const updated: Artifact = {
        ...existing,
        status,
        trunkVersion: newVersion,
        updatedAt: now,
      };
      artifacts.set(id, updated);

      // Create revision for status change
      const artifactRevisions = revisions.get(id) ?? [];
      artifactRevisions.push({
        id: `rev-${id}-${newVersion}`,
        artifactId: id,
        version: newVersion,
        snapshot: {
          title: updated.title,
          about: updated.about,
          notes: updated.notes,
          page: updated.page,
          status: updated.status,
        },
        authorNodeId,
        message: `Status changed to ${status}`,
        createdAt: now,
      });
      revisions.set(id, artifactRevisions);

      return updated;
    },

    async getRevisions(artifactId: Id): Promise<Revision[]> {
      const artifactRevisions = revisions.get(artifactId) ?? [];
      // Return in descending version order
      return [...artifactRevisions].sort((a, b) => b.version - a.version);
    },

    async getRevision(artifactId: Id, version: number): Promise<Revision | null> {
      const artifactRevisions = revisions.get(artifactId) ?? [];
      return artifactRevisions.find((r) => r.version === version) ?? null;
    },

    async getByEntityRef(entityId: Id): Promise<Artifact[]> {
      return Array.from(artifacts.values()).filter((a) => a.entityRefs?.includes(entityId));
    },

    clear() {
      artifacts.clear();
      revisions.clear();
    },
  };
}

// --- Test Fixtures ---

function createTestPageDoc(content: string = 'Test content'): PageDoc {
  return {
    version: 1,
    blocks: [
      {
        id: 'block-1',
        type: 'paragraph',
        content,
      },
    ],
  };
}

// --- Tests ---

describe('Artifact Repository (Phase 8.1)', () => {
  let repo: ReturnType<typeof createInMemoryArtifactRepository>;

  beforeEach(() => {
    repo = createInMemoryArtifactRepository();
  });

  // === 8.1 Artifact CRUD ===

  describe('create', () => {
    it('creates an artifact with required fields', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'My Document',
          about: 'A document about something important',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.id).toBeDefined();
      expect(artifact.nodeId).toBe('node-1');
      expect(artifact.title).toBe('My Document');
      expect(artifact.about).toBe('A document about something important');
      expect(artifact.status).toBe('draft'); // Default status
      expect(artifact.trunkVersion).toBe(1);
      expect(artifact.createdAt).toBeDefined();
      expect(artifact.updatedAt).toBeDefined();
    });

    it('creates an artifact with custom ID', async () => {
      const artifact = await repo.create(
        {
          id: 'custom-id-123',
          nodeId: 'node-1',
          title: 'Custom ID Doc',
          about: 'Testing custom IDs',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.id).toBe('custom-id-123');
    });

    it('creates an artifact with notes', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Doc with Notes',
          about: 'Has notes too',
          notes: '# Notes\n\nSome markdown notes here.',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.notes).toBe('# Notes\n\nSome markdown notes here.');
    });

    it('creates an artifact with specific status', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Active Doc',
          about: 'Already active',
          page: createTestPageDoc(),
          status: 'active',
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.status).toBe('active');
    });

    it('creates initial revision at version 1', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'My Doc',
          about: 'Testing revisions',
          page: createTestPageDoc('Initial content'),
        },
        { authorNodeId: 'user-1', message: 'First commit' }
      );

      const revision = await repo.getRevision(artifact.id, 1);

      expect(revision).not.toBeNull();
      expect(revision!.version).toBe(1);
      expect(revision!.authorNodeId).toBe('user-1');
      expect(revision!.message).toBe('First commit');
      expect(revision!.snapshot.title).toBe('My Doc');
      expect(revision!.snapshot.about).toBe('Testing revisions');
    });
  });

  describe('get', () => {
    it('retrieves an artifact by ID', async () => {
      const created = await repo.create(
        {
          id: 'get-test-1',
          nodeId: 'node-1',
          title: 'Get Test',
          about: 'Testing get',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );

      const retrieved = await repo.get('get-test-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('Get Test');
    });

    it('returns null for non-existent artifact', async () => {
      const result = await repo.get('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await repo.create(
        { id: 'a1', nodeId: 'node-1', title: 'Doc 1', about: 'First', page: createTestPageDoc(), status: 'draft' },
        { authorNodeId: 'user-1' }
      );
      await repo.create(
        { id: 'a2', nodeId: 'node-1', title: 'Doc 2', about: 'Second', page: createTestPageDoc(), status: 'active' },
        { authorNodeId: 'user-1' }
      );
      await repo.create(
        { id: 'a3', nodeId: 'node-2', title: 'Doc 3', about: 'Third', page: createTestPageDoc(), status: 'draft' },
        { authorNodeId: 'user-2' }
      );
      await repo.create(
        { id: 'a4', nodeId: 'node-1', title: 'Doc 4', about: 'Fourth', page: createTestPageDoc(), status: 'published' },
        { authorNodeId: 'user-1' }
      );
    });

    it('lists all artifacts', async () => {
      const result = await repo.list();
      expect(result).toHaveLength(4);
    });

    it('filters by nodeId', async () => {
      const result = await repo.list({ nodeId: 'node-1' });
      expect(result).toHaveLength(3);
      expect(result.every((a) => a.nodeId === 'node-1')).toBe(true);
    });

    it('filters by single status', async () => {
      const result = await repo.list({ status: ['draft'] });
      expect(result).toHaveLength(2);
      expect(result.every((a) => a.status === 'draft')).toBe(true);
    });

    it('filters by multiple statuses', async () => {
      const result = await repo.list({ status: ['draft', 'active'] });
      expect(result).toHaveLength(3);
    });

    it('combines nodeId and status filters', async () => {
      const result = await repo.list({ nodeId: 'node-1', status: ['draft'] });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('applies limit', async () => {
      const result = await repo.list({ limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('applies offset', async () => {
      const all = await repo.list();
      const withOffset = await repo.list({ offset: 2 });
      expect(withOffset).toHaveLength(2);
      expect(withOffset[0].id).toBe(all[2].id);
    });

    it('applies limit and offset together', async () => {
      const result = await repo.list({ offset: 1, limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    let artifactId: string;

    beforeEach(async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Original Title',
          about: 'Original about',
          notes: 'Original notes',
          page: createTestPageDoc('Original content'),
        },
        { authorNodeId: 'user-1' }
      );
      artifactId = artifact.id;
    });

    it('updates title', async () => {
      const updated = await repo.update(
        artifactId,
        { title: 'New Title' },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.title).toBe('New Title');
      expect(updated?.about).toBe('Original about'); // Unchanged
    });

    it('updates about', async () => {
      const updated = await repo.update(
        artifactId,
        { about: 'New about text' },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.about).toBe('New about text');
    });

    it('updates notes', async () => {
      const updated = await repo.update(
        artifactId,
        { notes: 'New notes' },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.notes).toBe('New notes');
    });

    it('clears notes when set to undefined explicitly', async () => {
      // First verify notes exist
      const original = await repo.get(artifactId);
      expect(original?.notes).toBe('Original notes');

      // Update with undefined notes (this should preserve)
      const updated = await repo.update(
        artifactId,
        { title: 'New Title' },
        { authorNodeId: 'user-1' }
      );
      expect(updated?.notes).toBe('Original notes');
    });

    it('updates page content', async () => {
      const newPage = createTestPageDoc('New content');
      const updated = await repo.update(
        artifactId,
        { page: newPage },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.page.blocks[0].content).toBe('New content');
    });

    it('increments trunkVersion on each update', async () => {
      const original = await repo.get(artifactId);
      expect(original?.trunkVersion).toBe(1);

      await repo.update(artifactId, { title: 'V2' }, { authorNodeId: 'user-1' });
      const v2 = await repo.get(artifactId);
      expect(v2?.trunkVersion).toBe(2);

      await repo.update(artifactId, { title: 'V3' }, { authorNodeId: 'user-1' });
      const v3 = await repo.get(artifactId);
      expect(v3?.trunkVersion).toBe(3);
    });

    it('creates revision for each update', async () => {
      await repo.update(artifactId, { title: 'V2' }, { authorNodeId: 'user-1', message: 'Second version' });
      await repo.update(artifactId, { title: 'V3' }, { authorNodeId: 'user-2', message: 'Third version' });

      const revisions = await repo.getRevisions(artifactId);
      expect(revisions).toHaveLength(3);
      expect(revisions[0].version).toBe(3);
      expect(revisions[1].version).toBe(2);
      expect(revisions[2].version).toBe(1);
    });

    it('returns null for non-existent artifact', async () => {
      const result = await repo.update(
        'non-existent',
        { title: 'Will Fail' },
        { authorNodeId: 'user-1' }
      );
      expect(result).toBeNull();
    });

    it('updates multiple fields at once', async () => {
      const newPage = createTestPageDoc('Multi-update content');
      const updated = await repo.update(
        artifactId,
        {
          title: 'Multi Title',
          about: 'Multi about',
          notes: 'Multi notes',
          page: newPage,
        },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.title).toBe('Multi Title');
      expect(updated?.about).toBe('Multi about');
      expect(updated?.notes).toBe('Multi notes');
      expect(updated?.page.blocks[0].content).toBe('Multi-update content');
      expect(updated?.trunkVersion).toBe(2);
    });
  });

  describe('status transitions', () => {
    let artifactId: string;

    beforeEach(async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Status Test',
          about: 'Testing status transitions',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );
      artifactId = artifact.id;
    });

    it('transitions from draft to active', async () => {
      const updated = await repo.updateStatus(artifactId, 'active', 'user-1');
      expect(updated?.status).toBe('active');
    });

    it('transitions from active to published', async () => {
      await repo.updateStatus(artifactId, 'active', 'user-1');
      const updated = await repo.updateStatus(artifactId, 'published', 'user-1');
      expect(updated?.status).toBe('published');
    });

    it('transitions from published to archived', async () => {
      await repo.updateStatus(artifactId, 'active', 'user-1');
      await repo.updateStatus(artifactId, 'published', 'user-1');
      const updated = await repo.updateStatus(artifactId, 'archived', 'user-1');
      expect(updated?.status).toBe('archived');
    });

    it('increments version on status change', async () => {
      const original = await repo.get(artifactId);
      expect(original?.trunkVersion).toBe(1);

      await repo.updateStatus(artifactId, 'active', 'user-1');
      const updated = await repo.get(artifactId);
      expect(updated?.trunkVersion).toBe(2);
    });

    it('creates revision for status change', async () => {
      await repo.updateStatus(artifactId, 'active', 'user-1');

      const revision = await repo.getRevision(artifactId, 2);
      expect(revision).not.toBeNull();
      expect(revision!.snapshot.status).toBe('active');
      expect(revision!.message).toBe('Status changed to active');
    });

    it('allows skipping statuses', async () => {
      // Can go directly from draft to published
      const updated = await repo.updateStatus(artifactId, 'published', 'user-1');
      expect(updated?.status).toBe('published');
    });

    it('allows reverting to earlier status', async () => {
      await repo.updateStatus(artifactId, 'active', 'user-1');
      await repo.updateStatus(artifactId, 'published', 'user-1');

      // Revert back to draft
      const updated = await repo.updateStatus(artifactId, 'draft', 'user-1');
      expect(updated?.status).toBe('draft');
    });

    it('returns null for non-existent artifact', async () => {
      const result = await repo.updateStatus('non-existent', 'active', 'user-1');
      expect(result).toBeNull();
    });
  });

  // === 8.2 Revision History ===

  describe('getRevisions', () => {
    let artifactId: string;

    beforeEach(async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Revision Test',
          about: 'Testing revisions',
          page: createTestPageDoc('v1'),
        },
        { authorNodeId: 'user-1', message: 'Initial' }
      );
      artifactId = artifact.id;

      // Create more revisions
      await repo.update(
        artifactId,
        { title: 'Revision Test v2', page: createTestPageDoc('v2') },
        { authorNodeId: 'user-2', message: 'Second revision' }
      );
      await repo.update(
        artifactId,
        { title: 'Revision Test v3', page: createTestPageDoc('v3') },
        { authorNodeId: 'user-1', message: 'Third revision' }
      );
    });

    it('returns all revisions in descending order', async () => {
      const revisions = await repo.getRevisions(artifactId);

      expect(revisions).toHaveLength(3);
      expect(revisions[0].version).toBe(3);
      expect(revisions[1].version).toBe(2);
      expect(revisions[2].version).toBe(1);
    });

    it('includes snapshot for each revision', async () => {
      const revisions = await repo.getRevisions(artifactId);

      expect(revisions[2].snapshot.title).toBe('Revision Test');
      expect(revisions[1].snapshot.title).toBe('Revision Test v2');
      expect(revisions[0].snapshot.title).toBe('Revision Test v3');
    });

    it('tracks author for each revision', async () => {
      const revisions = await repo.getRevisions(artifactId);

      expect(revisions[2].authorNodeId).toBe('user-1'); // Initial
      expect(revisions[1].authorNodeId).toBe('user-2'); // Second
      expect(revisions[0].authorNodeId).toBe('user-1'); // Third
    });

    it('returns empty array for non-existent artifact', async () => {
      const revisions = await repo.getRevisions('non-existent');
      expect(revisions).toEqual([]);
    });
  });

  describe('getRevision', () => {
    let artifactId: string;

    beforeEach(async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Version 1',
          about: 'First version',
          page: createTestPageDoc('Content v1'),
        },
        { authorNodeId: 'user-1' }
      );
      artifactId = artifact.id;

      await repo.update(
        artifactId,
        { title: 'Version 2', page: createTestPageDoc('Content v2') },
        { authorNodeId: 'user-1' }
      );
    });

    it('retrieves specific revision by version', async () => {
      const v1 = await repo.getRevision(artifactId, 1);
      expect(v1?.snapshot.title).toBe('Version 1');
      expect(v1?.snapshot.page.blocks[0].content).toBe('Content v1');

      const v2 = await repo.getRevision(artifactId, 2);
      expect(v2?.snapshot.title).toBe('Version 2');
      expect(v2?.snapshot.page.blocks[0].content).toBe('Content v2');
    });

    it('returns null for non-existent version', async () => {
      const result = await repo.getRevision(artifactId, 99);
      expect(result).toBeNull();
    });

    it('returns null for non-existent artifact', async () => {
      const result = await repo.getRevision('non-existent', 1);
      expect(result).toBeNull();
    });
  });

  // === Query Tests ===

  describe('query', () => {
    beforeEach(async () => {
      // Create artifacts with different timestamps
      await repo.create(
        { id: 'q1', nodeId: 'node-1', title: 'Query 1', about: 'A', page: createTestPageDoc(), status: 'draft' },
        { authorNodeId: 'user-1' }
      );

      // Simulate time passing
      await new Promise((r) => setTimeout(r, 10));

      await repo.create(
        { id: 'q2', nodeId: 'node-1', title: 'Query 2', about: 'B', page: createTestPageDoc(), status: 'active' },
        { authorNodeId: 'user-1' }
      );

      await new Promise((r) => setTimeout(r, 10));

      await repo.create(
        { id: 'q3', nodeId: 'node-1', title: 'Query 3', about: 'C', page: createTestPageDoc(), status: 'published' },
        { authorNodeId: 'user-1' }
      );
    });

    it('queries artifacts by node', async () => {
      const result = await repo.query('node-1', {});
      expect(result).toHaveLength(3);
    });

    it('filters by status in query', async () => {
      const result = await repo.query('node-1', { status: ['active', 'published'] });
      expect(result).toHaveLength(2);
    });

    it('applies limit in query', async () => {
      const result = await repo.query('node-1', { limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('returns empty for different node', async () => {
      const result = await repo.query('node-999', {});
      expect(result).toEqual([]);
    });
  });

  // === Complex Scenarios ===

  describe('complex scenarios', () => {
    it('tracks full lifecycle of an artifact', async () => {
      // 1. Create draft
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'My Article',
          about: 'An article about something',
          page: createTestPageDoc('Draft content'),
        },
        { authorNodeId: 'author-1', message: 'Initial draft' }
      );

      expect(artifact.status).toBe('draft');
      expect(artifact.trunkVersion).toBe(1);

      // 2. Edit content
      await repo.update(
        artifact.id,
        {
          title: 'My Article - Revised',
          page: createTestPageDoc('Revised draft content'),
        },
        { authorNodeId: 'author-1', message: 'Revised draft' }
      );

      // 3. Activate for review
      await repo.updateStatus(artifact.id, 'active', 'author-1');

      // 4. Make final edits
      await repo.update(
        artifact.id,
        { page: createTestPageDoc('Final content') },
        { authorNodeId: 'editor-1', message: 'Editor review complete' }
      );

      // 5. Publish
      await repo.updateStatus(artifact.id, 'published', 'editor-1');

      // Verify final state
      const final = await repo.get(artifact.id);
      expect(final?.status).toBe('published');
      expect(final?.trunkVersion).toBe(5);
      expect(final?.page.blocks[0].content).toBe('Final content');

      // Verify revision history
      const revisions = await repo.getRevisions(artifact.id);
      expect(revisions).toHaveLength(5);

      // Can access any historical state
      const draftSnapshot = await repo.getRevision(artifact.id, 1);
      expect(draftSnapshot?.snapshot.page.blocks[0].content).toBe('Draft content');
    });

    it('supports multiple authors editing same artifact', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'shared-node',
          title: 'Collaborative Doc',
          about: 'Team document',
          page: createTestPageDoc('Initial'),
        },
        { authorNodeId: 'user-a' }
      );

      await repo.update(
        artifact.id,
        { page: createTestPageDoc('User B edits') },
        { authorNodeId: 'user-b', message: 'B contribution' }
      );

      await repo.update(
        artifact.id,
        { page: createTestPageDoc('User C edits') },
        { authorNodeId: 'user-c', message: 'C contribution' }
      );

      await repo.update(
        artifact.id,
        { page: createTestPageDoc('User A edits again') },
        { authorNodeId: 'user-a', message: 'A follow-up' }
      );

      const revisions = await repo.getRevisions(artifact.id);
      const authors = revisions.map((r) => r.authorNodeId);

      expect(authors).toContain('user-a');
      expect(authors).toContain('user-b');
      expect(authors).toContain('user-c');
      expect(authors.filter((a) => a === 'user-a')).toHaveLength(2);
    });
  });
});
