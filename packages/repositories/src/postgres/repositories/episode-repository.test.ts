// Tests for Episode Repository (Phase 5.1)
// Verifies episode lifecycle: create, status transitions, queries, and variable bindings.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Episode, EpisodeStatus, EpisodeVariable } from '@omnilith/protocol';
import type {
  EpisodeRepository,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  EpisodeFilter,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemoryEpisodeRepository(): EpisodeRepository & { clear(): void } {
  const episodes = new Map<string, Episode>();

  return {
    async create(input: CreateEpisodeInput): Promise<Episode> {
      const id = input.id ?? `episode-${episodes.size + 1}`;
      const now = new Date().toISOString();
      const episode: Episode = {
        id,
        nodeId: input.nodeId,
        title: input.title,
        description: input.description,
        kind: input.kind,
        variables: input.variables,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        relatedArtifactIds: input.relatedArtifactIds,
        status: input.status ?? 'planned',
        createdAt: now,
        updatedAt: now,
      };
      episodes.set(id, episode);
      return episode;
    },

    async get(id: string): Promise<Episode | null> {
      return episodes.get(id) ?? null;
    },

    async list(filter?: EpisodeFilter): Promise<Episode[]> {
      let result = Array.from(episodes.values());

      if (filter?.nodeId) {
        result = result.filter((e) => e.nodeId === filter.nodeId);
      }
      if (filter?.status && filter.status.length > 0) {
        result = result.filter((e) => filter.status!.includes(e.status));
      }
      if (filter?.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter?.variableId) {
        result = result.filter((e) =>
          e.variables.some((v) => v.variableId === filter.variableId)
        );
      }

      // Sort by updatedAt descending (most recent first)
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async update(id: string, input: UpdateEpisodeInput): Promise<Episode | null> {
      const episode = episodes.get(id);
      if (!episode) return null;

      const updated: Episode = {
        ...episode,
        title: input.title ?? episode.title,
        description: input.description !== undefined ? input.description : episode.description,
        variables: input.variables ?? episode.variables,
        startsAt: input.startsAt !== undefined ? input.startsAt : episode.startsAt,
        endsAt: input.endsAt !== undefined ? input.endsAt : episode.endsAt,
        relatedArtifactIds:
          input.relatedArtifactIds !== undefined
            ? input.relatedArtifactIds
            : episode.relatedArtifactIds,
        status: input.status ?? episode.status,
        updatedAt: new Date().toISOString(),
      };

      episodes.set(id, updated);
      return updated;
    },

    async updateStatus(id: string, status: EpisodeStatus): Promise<Episode | null> {
      const episode = episodes.get(id);
      if (!episode) return null;

      const updated: Episode = {
        ...episode,
        status,
        updatedAt: new Date().toISOString(),
      };

      episodes.set(id, updated);
      return updated;
    },

    async getActive(nodeId: string): Promise<Episode[]> {
      const active = Array.from(episodes.values())
        .filter((e) => e.nodeId === nodeId && e.status === 'active')
        .sort((a, b) => {
          // Sort by startsAt descending
          const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
          const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
          return bTime - aTime;
        });
      return active;
    },

    async getByVariable(variableId: string): Promise<Episode[]> {
      return Array.from(episodes.values()).filter((e) =>
        e.variables.some((v) => v.variableId === variableId)
      );
    },

    async getByArtifact(artifactId: string): Promise<Episode[]> {
      return Array.from(episodes.values()).filter((e) =>
        e.relatedArtifactIds?.includes(artifactId)
      );
    },

    clear() {
      episodes.clear();
    },
  };
}

// --- Tests ---

describe('EpisodeRepository', () => {
  let repo: ReturnType<typeof createInMemoryEpisodeRepository>;

  beforeEach(() => {
    repo = createInMemoryEpisodeRepository();
  });

  describe('create', () => {
    it('creates an episode with minimal required fields', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Improve Sleep',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
      });

      expect(episode.id).toBeDefined();
      expect(episode.nodeId).toBe('node-1');
      expect(episode.title).toBe('Improve Sleep');
      expect(episode.kind).toBe('regulatory');
      expect(episode.variables).toHaveLength(1);
      expect(episode.variables[0].variableId).toBe('var-sleep');
      expect(episode.variables[0].intent).toBe('stabilize');
      expect(episode.status).toBe('planned');
      expect(episode.createdAt).toBeDefined();
      expect(episode.updatedAt).toBeDefined();
    });

    it('creates an episode with all optional fields', async () => {
      const startsAt = '2024-01-15T00:00:00Z';
      const endsAt = '2024-01-22T00:00:00Z';

      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Exploration Sprint',
        description: 'Testing new sleep patterns',
        kind: 'exploratory',
        variables: [
          { variableId: 'var-sleep', intent: 'probe' },
          { variableId: 'var-energy', intent: 'discover' },
        ],
        startsAt,
        endsAt,
        relatedArtifactIds: ['artifact-1', 'artifact-2'],
        status: 'active',
      });

      expect(episode.description).toBe('Testing new sleep patterns');
      expect(episode.kind).toBe('exploratory');
      expect(episode.variables).toHaveLength(2);
      expect(episode.startsAt).toBe(startsAt);
      expect(episode.endsAt).toBe(endsAt);
      expect(episode.relatedArtifactIds).toEqual(['artifact-1', 'artifact-2']);
      expect(episode.status).toBe('active');
    });

    it('creates episode with custom id when provided', async () => {
      const episode = await repo.create({
        id: 'my-custom-id',
        nodeId: 'node-1',
        title: 'Custom Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'maintain' }],
      });

      expect(episode.id).toBe('my-custom-id');
    });

    it('supports all episode intents', async () => {
      const intents = ['stabilize', 'increase', 'decrease', 'maintain', 'probe', 'expand', 'discover'] as const;

      for (const intent of intents) {
        const episode = await repo.create({
          nodeId: 'node-1',
          title: `Episode with ${intent}`,
          kind: intent === 'probe' || intent === 'expand' || intent === 'discover' ? 'exploratory' : 'regulatory',
          variables: [{ variableId: 'var-1', intent }],
        });

        expect(episode.variables[0].intent).toBe(intent);
      }
    });
  });

  describe('get', () => {
    it('returns episode by id', async () => {
      const created = await repo.create({
        nodeId: 'node-1',
        title: 'Test Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const retrieved = await repo.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it('returns null for non-existent episode', async () => {
      const episode = await repo.get('non-existent-id');
      expect(episode).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create test episodes
      await repo.create({
        id: 'ep-1',
        nodeId: 'node-1',
        title: 'Episode 1',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
        status: 'active',
      });
      await repo.create({
        id: 'ep-2',
        nodeId: 'node-1',
        title: 'Episode 2',
        kind: 'exploratory',
        variables: [{ variableId: 'var-energy', intent: 'probe' }],
        status: 'planned',
      });
      await repo.create({
        id: 'ep-3',
        nodeId: 'node-2',
        title: 'Episode 3',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'increase' }],
        status: 'completed',
      });
    });

    it('lists all episodes without filter', async () => {
      const episodes = await repo.list();
      expect(episodes).toHaveLength(3);
    });

    it('filters by nodeId', async () => {
      const episodes = await repo.list({ nodeId: 'node-1' });
      expect(episodes).toHaveLength(2);
      expect(episodes.every((e) => e.nodeId === 'node-1')).toBe(true);
    });

    it('filters by single status', async () => {
      const episodes = await repo.list({ status: ['active'] });
      expect(episodes).toHaveLength(1);
      expect(episodes[0].status).toBe('active');
    });

    it('filters by multiple statuses', async () => {
      const episodes = await repo.list({ status: ['active', 'planned'] });
      expect(episodes).toHaveLength(2);
      expect(episodes.every((e) => e.status === 'active' || e.status === 'planned')).toBe(true);
    });

    it('filters by kind', async () => {
      const episodes = await repo.list({ kind: 'regulatory' });
      expect(episodes).toHaveLength(2);
      expect(episodes.every((e) => e.kind === 'regulatory')).toBe(true);
    });

    it('filters by variableId', async () => {
      const episodes = await repo.list({ variableId: 'var-sleep' });
      expect(episodes).toHaveLength(2);
      expect(
        episodes.every((e) => e.variables.some((v) => v.variableId === 'var-sleep'))
      ).toBe(true);
    });

    it('applies limit', async () => {
      const episodes = await repo.list({ limit: 2 });
      expect(episodes).toHaveLength(2);
    });

    it('applies offset', async () => {
      const episodes = await repo.list({ offset: 1 });
      expect(episodes).toHaveLength(2);
    });

    it('combines multiple filters', async () => {
      const episodes = await repo.list({
        nodeId: 'node-1',
        kind: 'regulatory',
        status: ['active'],
      });
      expect(episodes).toHaveLength(1);
      expect(episodes[0].title).toBe('Episode 1');
    });
  });

  describe('update', () => {
    it('updates episode title', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Original Title',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update(episode.id, { title: 'New Title' });

      expect(updated?.title).toBe('New Title');
      // Verify update was processed (updatedAt should exist)
      expect(updated?.updatedAt).toBeDefined();
    });

    it('updates episode description', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const updated = await repo.update(episode.id, { description: 'New description' });

      expect(updated?.description).toBe('New description');
    });

    it('preserves description when update does not include it', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        description: 'Initial description',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      // Update only title, not description
      const updated = await repo.update(episode.id, { title: 'New Title' });

      // Description should be preserved
      expect(updated?.description).toBe('Initial description');
    });

    it('updates episode variables', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const newVariables: EpisodeVariable[] = [
        { variableId: 'var-2', intent: 'increase' },
        { variableId: 'var-3', intent: 'maintain' },
      ];

      const updated = await repo.update(episode.id, { variables: newVariables });

      expect(updated?.variables).toEqual(newVariables);
    });

    it('updates episode status', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const updated = await repo.update(episode.id, { status: 'active' });

      expect(updated?.status).toBe('active');
    });

    it('updates startsAt and endsAt', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const updated = await repo.update(episode.id, {
        startsAt: '2024-02-01T00:00:00Z',
        endsAt: '2024-02-08T00:00:00Z',
      });

      expect(updated?.startsAt).toBe('2024-02-01T00:00:00Z');
      expect(updated?.endsAt).toBe('2024-02-08T00:00:00Z');
    });

    it('updates relatedArtifactIds', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        relatedArtifactIds: ['art-1'],
      });

      const updated = await repo.update(episode.id, {
        relatedArtifactIds: ['art-1', 'art-2', 'art-3'],
      });

      expect(updated?.relatedArtifactIds).toEqual(['art-1', 'art-2', 'art-3']);
    });

    it('returns null for non-existent episode', async () => {
      const updated = await repo.update('non-existent', { title: 'New Title' });
      expect(updated).toBeNull();
    });

    it('preserves unchanged fields', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Original',
        description: 'Original description',
        kind: 'exploratory',
        variables: [{ variableId: 'var-1', intent: 'probe' }],
        startsAt: '2024-01-01T00:00:00Z',
        relatedArtifactIds: ['art-1'],
      });

      const updated = await repo.update(episode.id, { title: 'New Title' });

      expect(updated?.title).toBe('New Title');
      expect(updated?.description).toBe('Original description');
      expect(updated?.kind).toBe('exploratory');
      expect(updated?.variables).toEqual([{ variableId: 'var-1', intent: 'probe' }]);
      expect(updated?.startsAt).toBe('2024-01-01T00:00:00Z');
      expect(updated?.relatedArtifactIds).toEqual(['art-1']);
    });
  });

  describe('updateStatus', () => {
    it('transitions from planned to active', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'planned',
      });

      const updated = await repo.updateStatus(episode.id, 'active');

      expect(updated?.status).toBe('active');
    });

    it('transitions from active to completed', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'active',
      });

      const updated = await repo.updateStatus(episode.id, 'completed');

      expect(updated?.status).toBe('completed');
    });

    it('transitions from active to abandoned', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'active',
      });

      const updated = await repo.updateStatus(episode.id, 'abandoned');

      expect(updated?.status).toBe('abandoned');
    });

    it('updates timestamp on status change', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Test',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
      });

      const originalUpdatedAt = episode.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.updateStatus(episode.id, 'active');

      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('returns null for non-existent episode', async () => {
      const updated = await repo.updateStatus('non-existent', 'active');
      expect(updated).toBeNull();
    });
  });

  describe('getActive', () => {
    it('returns active episodes for a node', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Active 1',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'active',
        startsAt: '2024-01-01T00:00:00Z',
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Active 2',
        kind: 'exploratory',
        variables: [{ variableId: 'var-2', intent: 'probe' }],
        status: 'active',
        startsAt: '2024-01-15T00:00:00Z',
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Planned',
        kind: 'regulatory',
        variables: [{ variableId: 'var-3', intent: 'maintain' }],
        status: 'planned',
      });

      const active = await repo.getActive('node-1');

      expect(active).toHaveLength(2);
      expect(active.every((e) => e.status === 'active')).toBe(true);
    });

    it('returns empty array when no active episodes', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Planned',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'planned',
      });

      const active = await repo.getActive('node-1');

      expect(active).toHaveLength(0);
    });

    it('only returns episodes for the specified node', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Node 1 Active',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'active',
      });
      await repo.create({
        nodeId: 'node-2',
        title: 'Node 2 Active',
        kind: 'regulatory',
        variables: [{ variableId: 'var-2', intent: 'stabilize' }],
        status: 'active',
      });

      const active = await repo.getActive('node-1');

      expect(active).toHaveLength(1);
      expect(active[0].nodeId).toBe('node-1');
    });

    it('sorts by startsAt descending', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Earlier',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        status: 'active',
        startsAt: '2024-01-01T00:00:00Z',
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Later',
        kind: 'regulatory',
        variables: [{ variableId: 'var-2', intent: 'stabilize' }],
        status: 'active',
        startsAt: '2024-02-01T00:00:00Z',
      });

      const active = await repo.getActive('node-1');

      expect(active[0].title).toBe('Later');
      expect(active[1].title).toBe('Earlier');
    });
  });

  describe('getByVariable', () => {
    it('returns episodes targeting a specific variable', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 1',
        kind: 'regulatory',
        variables: [
          { variableId: 'var-sleep', intent: 'stabilize' },
          { variableId: 'var-energy', intent: 'increase' },
        ],
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 2',
        kind: 'exploratory',
        variables: [{ variableId: 'var-sleep', intent: 'probe' }],
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 3',
        kind: 'regulatory',
        variables: [{ variableId: 'var-focus', intent: 'maintain' }],
      });

      const episodes = await repo.getByVariable('var-sleep');

      expect(episodes).toHaveLength(2);
      expect(episodes.every((e) => e.variables.some((v) => v.variableId === 'var-sleep'))).toBe(
        true
      );
    });

    it('returns empty array when no episodes target the variable', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-other', intent: 'stabilize' }],
      });

      const episodes = await repo.getByVariable('var-sleep');

      expect(episodes).toHaveLength(0);
    });
  });

  describe('getByArtifact', () => {
    it('returns episodes related to a specific artifact', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 1',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        relatedArtifactIds: ['art-1', 'art-2'],
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 2',
        kind: 'exploratory',
        variables: [{ variableId: 'var-2', intent: 'probe' }],
        relatedArtifactIds: ['art-1'],
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode 3',
        kind: 'regulatory',
        variables: [{ variableId: 'var-3', intent: 'maintain' }],
        relatedArtifactIds: ['art-3'],
      });

      const episodes = await repo.getByArtifact('art-1');

      expect(episodes).toHaveLength(2);
      expect(episodes.every((e) => e.relatedArtifactIds?.includes('art-1'))).toBe(true);
    });

    it('returns empty array when no episodes reference the artifact', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        relatedArtifactIds: ['art-other'],
      });

      const episodes = await repo.getByArtifact('art-1');

      expect(episodes).toHaveLength(0);
    });

    it('handles episodes without relatedArtifactIds', async () => {
      await repo.create({
        nodeId: 'node-1',
        title: 'Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'stabilize' }],
        // No relatedArtifactIds
      });

      const episodes = await repo.getByArtifact('art-1');

      expect(episodes).toHaveLength(0);
    });
  });

  describe('Episode lifecycle integration', () => {
    it('supports full episode lifecycle: planned -> active -> completed', async () => {
      // 1. Create planned episode
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Sleep Regulation Sprint',
        description: 'Focus on improving sleep quality',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
        status: 'planned',
      });

      expect(episode.status).toBe('planned');

      // 2. Activate episode
      const activated = await repo.updateStatus(episode.id, 'active');
      expect(activated?.status).toBe('active');

      // Verify it appears in getActive
      const active = await repo.getActive('node-1');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(episode.id);

      // 3. Complete episode
      const completed = await repo.updateStatus(episode.id, 'completed');
      expect(completed?.status).toBe('completed');

      // Verify it no longer appears in getActive
      const activeAfterComplete = await repo.getActive('node-1');
      expect(activeAfterComplete).toHaveLength(0);

      // Verify it still exists and can be retrieved
      const retrieved = await repo.get(episode.id);
      expect(retrieved?.status).toBe('completed');
    });

    it('supports abandoning an episode', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Failed Experiment',
        kind: 'exploratory',
        variables: [{ variableId: 'var-1', intent: 'discover' }],
        status: 'active',
      });

      const abandoned = await repo.updateStatus(episode.id, 'abandoned');

      expect(abandoned?.status).toBe('abandoned');

      const active = await repo.getActive('node-1');
      expect(active).toHaveLength(0);
    });

    it('supports multiple active episodes for the same variable', async () => {
      // This could happen if one is regulatory and another exploratory
      await repo.create({
        nodeId: 'node-1',
        title: 'Regulatory Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-sleep', intent: 'stabilize' }],
        status: 'active',
      });
      await repo.create({
        nodeId: 'node-1',
        title: 'Exploratory Episode',
        kind: 'exploratory',
        variables: [{ variableId: 'var-sleep', intent: 'probe' }],
        status: 'active',
      });

      const active = await repo.getActive('node-1');
      expect(active).toHaveLength(2);

      const byVariable = await repo.getByVariable('var-sleep');
      expect(byVariable).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty variables array', async () => {
      // While unusual, technically valid per spec
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'General Episode',
        kind: 'regulatory',
        variables: [],
      });

      expect(episode.variables).toEqual([]);
    });

    it('handles episode with multiple variables with same intent', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Multi-Variable Episode',
        kind: 'regulatory',
        variables: [
          { variableId: 'var-1', intent: 'stabilize' },
          { variableId: 'var-2', intent: 'stabilize' },
          { variableId: 'var-3', intent: 'stabilize' },
        ],
      });

      expect(episode.variables).toHaveLength(3);
      expect(episode.variables.every((v) => v.intent === 'stabilize')).toBe(true);
    });

    it('handles episode spanning very long time period', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Long-term Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'maintain' }],
        startsAt: '2024-01-01T00:00:00Z',
        endsAt: '2025-12-31T23:59:59Z',
      });

      expect(episode.startsAt).toBe('2024-01-01T00:00:00Z');
      expect(episode.endsAt).toBe('2025-12-31T23:59:59Z');
    });

    it('handles episode with no end date (open-ended)', async () => {
      const episode = await repo.create({
        nodeId: 'node-1',
        title: 'Open-ended Episode',
        kind: 'regulatory',
        variables: [{ variableId: 'var-1', intent: 'maintain' }],
        startsAt: '2024-01-01T00:00:00Z',
        // No endsAt
      });

      expect(episode.startsAt).toBe('2024-01-01T00:00:00Z');
      expect(episode.endsAt).toBeUndefined();
    });
  });
});
