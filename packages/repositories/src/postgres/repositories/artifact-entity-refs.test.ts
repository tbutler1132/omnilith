// Tests for Artifact-Entity References (Phase 6.2)
// Verifies that artifacts can reference entities and be queried by entity reference.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Artifact, Revision, ArtifactStatus, PageDoc, Id } from '@omnilith/protocol';
import type {
  ArtifactRepository,
  CreateArtifactInput,
  UpdateArtifactInput,
  ArtifactFilter,
  CreateRevisionInput,
} from '../../interfaces/index.js';

// In-memory implementation for testing artifact-entity relationships
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

    async updateStatus(id: Id, status: ArtifactStatus, _authorNodeId: Id): Promise<Artifact | null> {
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

      return updated;
    },

    async getRevisions(artifactId: Id): Promise<Revision[]> {
      return revisions.get(artifactId) ?? [];
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

function createTestPageDoc(): PageDoc {
  return {
    version: 1,
    blocks: [
      {
        id: 'block-1',
        type: 'paragraph',
        content: 'Test content',
      },
    ],
  };
}

// --- Tests ---

describe('Artifact Entity References (Phase 6.2)', () => {
  let repo: ReturnType<typeof createInMemoryArtifactRepository>;

  beforeEach(() => {
    repo = createInMemoryArtifactRepository();
  });

  describe('create with entityRefs', () => {
    it('creates an artifact with entity references', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Song Lyrics',
          about: 'Lyrics for a song',
          page: createTestPageDoc(),
          entityRefs: ['entity-song-1'],
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.entityRefs).toEqual(['entity-song-1']);
    });

    it('creates an artifact with multiple entity references', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Collaboration Notes',
          about: 'Notes about a collaboration',
          page: createTestPageDoc(),
          entityRefs: ['entity-song-1', 'entity-project-1', 'entity-person-1'],
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.entityRefs).toHaveLength(3);
      expect(artifact.entityRefs).toContain('entity-song-1');
      expect(artifact.entityRefs).toContain('entity-project-1');
      expect(artifact.entityRefs).toContain('entity-person-1');
    });

    it('creates an artifact without entity references', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'General Notes',
          about: 'Just some notes',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.entityRefs).toBeUndefined();
    });

    it('creates an artifact with empty entity references array', async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'General Notes',
          about: 'Just some notes',
          page: createTestPageDoc(),
          entityRefs: [],
        },
        { authorNodeId: 'user-1' }
      );

      expect(artifact.entityRefs).toEqual([]);
    });
  });

  describe('getByEntityRef', () => {
    beforeEach(async () => {
      // Create artifacts with various entity references
      await repo.create(
        {
          id: 'artifact-1',
          nodeId: 'node-1',
          title: 'Song Lyrics',
          about: 'Lyrics',
          page: createTestPageDoc(),
          entityRefs: ['song-1'],
        },
        { authorNodeId: 'user-1' }
      );

      await repo.create(
        {
          id: 'artifact-2',
          nodeId: 'node-1',
          title: 'Production Notes',
          about: 'Notes',
          page: createTestPageDoc(),
          entityRefs: ['song-1', 'project-1'],
        },
        { authorNodeId: 'user-1' }
      );

      await repo.create(
        {
          id: 'artifact-3',
          nodeId: 'node-1',
          title: 'Project Plan',
          about: 'Plan',
          page: createTestPageDoc(),
          entityRefs: ['project-1'],
        },
        { authorNodeId: 'user-1' }
      );

      await repo.create(
        {
          id: 'artifact-4',
          nodeId: 'node-1',
          title: 'Unrelated Notes',
          about: 'Unrelated',
          page: createTestPageDoc(),
        },
        { authorNodeId: 'user-1' }
      );
    });

    it('returns all artifacts referencing an entity', async () => {
      const result = await repo.getByEntityRef('song-1');

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(['artifact-1', 'artifact-2']);
    });

    it('returns artifacts that reference entity among multiple refs', async () => {
      const result = await repo.getByEntityRef('project-1');

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(['artifact-2', 'artifact-3']);
    });

    it('returns empty array when no artifacts reference entity', async () => {
      const result = await repo.getByEntityRef('non-existent-entity');

      expect(result).toEqual([]);
    });

    it('does not return artifacts without entity refs', async () => {
      const result = await repo.getByEntityRef('song-1');

      expect(result.some((a) => a.id === 'artifact-4')).toBe(false);
    });
  });

  describe('list with entityRefs filter', () => {
    beforeEach(async () => {
      await repo.create(
        {
          id: 'artifact-1',
          nodeId: 'node-1',
          title: 'Artifact 1',
          about: 'About 1',
          page: createTestPageDoc(),
          entityRefs: ['entity-a', 'entity-b'],
        },
        { authorNodeId: 'user-1' }
      );

      await repo.create(
        {
          id: 'artifact-2',
          nodeId: 'node-1',
          title: 'Artifact 2',
          about: 'About 2',
          page: createTestPageDoc(),
          entityRefs: ['entity-b', 'entity-c'],
        },
        { authorNodeId: 'user-1' }
      );

      await repo.create(
        {
          id: 'artifact-3',
          nodeId: 'node-1',
          title: 'Artifact 3',
          about: 'About 3',
          page: createTestPageDoc(),
          entityRefs: ['entity-d'],
        },
        { authorNodeId: 'user-1' }
      );
    });

    it('filters by single entity ref', async () => {
      const result = await repo.list({ entityRefs: ['entity-a'] });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('artifact-1');
    });

    it('filters by multiple entity refs (OR logic)', async () => {
      const result = await repo.list({ entityRefs: ['entity-a', 'entity-d'] });

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(['artifact-1', 'artifact-3']);
    });

    it('returns artifacts matching any of the entity refs', async () => {
      const result = await repo.list({ entityRefs: ['entity-b'] });

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(['artifact-1', 'artifact-2']);
    });

    it('combines entityRefs filter with other filters', async () => {
      const result = await repo.list({ entityRefs: ['entity-b'], limit: 1 });

      expect(result).toHaveLength(1);
    });
  });

  describe('update entityRefs', () => {
    let artifactId: string;

    beforeEach(async () => {
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Test Artifact',
          about: 'About',
          page: createTestPageDoc(),
          entityRefs: ['entity-1'],
        },
        { authorNodeId: 'user-1' }
      );
      artifactId = artifact.id;
    });

    it('adds entity references', async () => {
      const updated = await repo.update(
        artifactId,
        { entityRefs: ['entity-1', 'entity-2'] },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.entityRefs).toEqual(['entity-1', 'entity-2']);
    });

    it('removes entity references', async () => {
      const updated = await repo.update(
        artifactId,
        { entityRefs: [] },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.entityRefs).toEqual([]);
    });

    it('replaces entity references', async () => {
      const updated = await repo.update(
        artifactId,
        { entityRefs: ['entity-new'] },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.entityRefs).toEqual(['entity-new']);
    });

    it('preserves entity refs when not updating them', async () => {
      const updated = await repo.update(
        artifactId,
        { title: 'New Title' },
        { authorNodeId: 'user-1' }
      );

      expect(updated?.entityRefs).toEqual(['entity-1']);
      expect(updated?.title).toBe('New Title');
    });

    it('creates new version when updating entity refs', async () => {
      const original = await repo.get(artifactId);

      await repo.update(
        artifactId,
        { entityRefs: ['entity-2'] },
        { authorNodeId: 'user-1' }
      );

      const updated = await repo.get(artifactId);

      expect(updated?.trunkVersion).toBe(original!.trunkVersion + 1);
    });
  });

  describe('artifact-entity relationship patterns', () => {
    it('supports multiple artifacts referencing the same entity', async () => {
      const songEntityId = 'song-123';

      // Lyrics artifact
      await repo.create(
        {
          nodeId: 'music-node',
          title: 'My Song - Lyrics',
          about: 'Lyrics for My Song',
          page: createTestPageDoc(),
          entityRefs: [songEntityId],
        },
        { authorNodeId: 'user-1' }
      );

      // Production notes artifact
      await repo.create(
        {
          nodeId: 'music-node',
          title: 'My Song - Production Notes',
          about: 'Production notes for My Song',
          page: createTestPageDoc(),
          entityRefs: [songEntityId],
        },
        { authorNodeId: 'user-1' }
      );

      // Marketing plan artifact
      await repo.create(
        {
          nodeId: 'music-node',
          title: 'My Song - Marketing Plan',
          about: 'Marketing plan for My Song release',
          page: createTestPageDoc(),
          entityRefs: [songEntityId],
        },
        { authorNodeId: 'user-1' }
      );

      const relatedArtifacts = await repo.getByEntityRef(songEntityId);

      expect(relatedArtifacts).toHaveLength(3);
    });

    it('supports artifact referencing multiple entities', async () => {
      // Collaboration document referencing multiple entities
      await repo.create(
        {
          id: 'collab-doc',
          nodeId: 'work-node',
          title: 'Project Collaboration',
          about: 'Notes on collaboration between multiple projects',
          page: createTestPageDoc(),
          entityRefs: ['project-a', 'project-b', 'person-1', 'person-2'],
        },
        { authorNodeId: 'user-1' }
      );

      // Verify artifact appears in queries for all referenced entities
      const projectA = await repo.getByEntityRef('project-a');
      const projectB = await repo.getByEntityRef('project-b');
      const person1 = await repo.getByEntityRef('person-1');
      const person2 = await repo.getByEntityRef('person-2');

      expect(projectA).toHaveLength(1);
      expect(projectB).toHaveLength(1);
      expect(person1).toHaveLength(1);
      expect(person2).toHaveLength(1);

      // All should be the same artifact
      expect(projectA[0].id).toBe('collab-doc');
      expect(projectB[0].id).toBe('collab-doc');
      expect(person1[0].id).toBe('collab-doc');
      expect(person2[0].id).toBe('collab-doc');
    });

    it('supports evolving entity references over time', async () => {
      // Start with a draft referencing initial entity
      const artifact = await repo.create(
        {
          nodeId: 'node-1',
          title: 'Evolving Document',
          about: 'A document that evolves',
          page: createTestPageDoc(),
          entityRefs: ['entity-v1'],
        },
        { authorNodeId: 'user-1' }
      );

      // Version 2: add more references
      await repo.update(
        artifact.id,
        { entityRefs: ['entity-v1', 'entity-v2'] },
        { authorNodeId: 'user-1', message: 'Added entity-v2 reference' }
      );

      // Version 3: replace references
      await repo.update(
        artifact.id,
        { entityRefs: ['entity-v3'] },
        { authorNodeId: 'user-1', message: 'Switched to entity-v3' }
      );

      const final = await repo.get(artifact.id);

      expect(final?.entityRefs).toEqual(['entity-v3']);
      expect(final?.trunkVersion).toBe(3);

      // Old entity no longer has this artifact
      const oldEntityArtifacts = await repo.getByEntityRef('entity-v1');
      expect(oldEntityArtifacts).toHaveLength(0);

      // New entity has this artifact
      const newEntityArtifacts = await repo.getByEntityRef('entity-v3');
      expect(newEntityArtifacts).toHaveLength(1);
    });

    it('handles artifacts across different nodes referencing same entity', async () => {
      // Shared entity ID across nodes
      const sharedProjectId = 'project-cross-node';

      // Artifact in node-1
      await repo.create(
        {
          nodeId: 'node-1',
          title: 'Node 1 Notes',
          about: 'Notes from node 1',
          page: createTestPageDoc(),
          entityRefs: [sharedProjectId],
        },
        { authorNodeId: 'user-1' }
      );

      // Artifact in node-2
      await repo.create(
        {
          nodeId: 'node-2',
          title: 'Node 2 Notes',
          about: 'Notes from node 2',
          page: createTestPageDoc(),
          entityRefs: [sharedProjectId],
        },
        { authorNodeId: 'user-2' }
      );

      // getByEntityRef returns all artifacts regardless of node
      const allArtifacts = await repo.getByEntityRef(sharedProjectId);
      expect(allArtifacts).toHaveLength(2);

      // list with nodeId filter respects node boundary
      const node1Artifacts = await repo.list({
        nodeId: 'node-1',
        entityRefs: [sharedProjectId],
      });
      expect(node1Artifacts).toHaveLength(1);
      expect(node1Artifacts[0].nodeId).toBe('node-1');
    });
  });
});
