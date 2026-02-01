// Tests for observation ingestion

import { describe, it, expect, beforeEach } from 'vitest';
import { ingestObservation, ingestObservations } from './observation.js';
import {
  ValidationError,
  ProvenanceError,
  NodeNotFoundError,
  InvalidObservationTypeError,
} from '../errors.js';
import type { RepositoryContext } from '@omnilith/repositories';
import type { Node, Observation } from '@omnilith/protocol';

// Minimal in-memory repository for testing
function createTestRepositoryContext(): RepositoryContext {
  const nodes = new Map<string, Node>();
  const observations = new Map<string, Observation>();

  // Pre-create a test node
  nodes.set('test-node', {
    id: 'test-node',
    kind: 'subject',
    name: 'Test Node',
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Pre-create a source node
  nodes.set('source-node', {
    id: 'source-node',
    kind: 'subject',
    name: 'Source Node',
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Pre-create an agent node
  nodes.set('agent-node', {
    id: 'agent-node',
    kind: 'agent',
    name: 'Agent Node',
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    nodes: {
      async get(id) {
        return nodes.get(id) ?? null;
      },
      // Stubs for other methods
      async create() {
        throw new Error('Not implemented');
      },
      async list() {
        return [];
      },
      async update() {
        return null;
      },
      async addEdge() {
        throw new Error('Not implemented');
      },
      async removeEdge() {
        return false;
      },
      async getEdges() {
        return [];
      },
      async setAgentDelegation() {},
      async getAgentDelegation() {
        return null;
      },
      async revokeAgentDelegation() {
        return false;
      },
    },
    observations: {
      async append(input) {
        const id = input.id ?? `obs-${observations.size + 1}`;
        const observation: Observation = {
          id,
          nodeId: input.nodeId,
          type: input.type,
          timestamp: input.timestamp ?? new Date().toISOString(),
          payload: input.payload,
          provenance: input.provenance,
          tags: input.tags,
        };
        observations.set(id, observation);
        return observation;
      },
      async get(id) {
        return observations.get(id) ?? null;
      },
      async query() {
        return [];
      },
      async count() {
        return 0;
      },
      async getByType() {
        return [];
      },
      async getRecent() {
        return [];
      },
      async *stream() {},
    },
    // Stubs for other repositories
    artifacts: {} as RepositoryContext['artifacts'],
    variables: {} as RepositoryContext['variables'],
    episodes: {} as RepositoryContext['episodes'],
    policies: {} as RepositoryContext['policies'],
    actionRuns: {} as RepositoryContext['actionRuns'],
    surfaces: {} as RepositoryContext['surfaces'],
    entities: {} as RepositoryContext['entities'],
    grants: {} as RepositoryContext['grants'],
  };
}

describe('ingestObservation', () => {
  let repos: RepositoryContext;

  beforeEach(() => {
    repos = createTestRepositoryContext();
  });

  describe('valid observations', () => {
    it('should ingest a valid observation', async () => {
      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: 'source-node' },
      });

      expect(result.created).toBe(true);
      expect(result.observation).toBeDefined();
      expect(result.observation.id).toBeDefined();
      expect(result.observation.nodeId).toBe('test-node');
      expect(result.observation.type).toBe('health.sleep');
      expect(result.observation.payload).toEqual({ hours: 7.5 });
      expect(result.observation.provenance.sourceId).toBe('source-node');
    });

    it('should ingest observation with all optional fields', async () => {
      const timestamp = new Date().toISOString();
      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'health.sleep.quality',
        payload: { hours: 7.5, quality: 'good' },
        provenance: {
          sourceId: 'agent-node',
          sponsorId: 'source-node',
          method: 'sensor_ingest',
          confidence: 0.95,
        },
        timestamp,
        tags: ['sleep', 'health', 'automated'],
      });

      expect(result.observation.timestamp).toBe(timestamp);
      expect(result.observation.tags).toEqual(['sleep', 'health', 'automated']);
      expect(result.observation.provenance.sponsorId).toBe('source-node');
      expect(result.observation.provenance.method).toBe('sensor_ingest');
      expect(result.observation.provenance.confidence).toBe(0.95);
    });

    it('should accept null payload', async () => {
      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'system.heartbeat',
        payload: null,
        provenance: { sourceId: 'source-node' },
      });

      expect(result.observation.payload).toBeNull();
    });

    it('should accept complex nested payload', async () => {
      const payload = {
        data: {
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' },
          },
        },
        metadata: {
          version: 1,
        },
      };

      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'data.complex',
        payload,
        provenance: { sourceId: 'source-node' },
      });

      expect(result.observation.payload).toEqual(payload);
    });
  });

  describe('observation type validation', () => {
    it('should reject empty type', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: '',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should reject type starting with dot', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: '.health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should reject type ending with dot', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep.',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should reject type with consecutive dots', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health..sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should reject uppercase type', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'Health.Sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should reject type starting with number', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: '1health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(InvalidObservationTypeError);
    });

    it('should accept type with underscores', async () => {
      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'health_data.sleep_quality',
        payload: {},
        provenance: { sourceId: 'source-node' },
      });

      expect(result.observation.type).toBe('health_data.sleep_quality');
    });

    it('should accept type with numbers after first letter', async () => {
      const result = await ingestObservation(repos, {
        nodeId: 'test-node',
        type: 'sensor1.temperature2',
        payload: {},
        provenance: { sourceId: 'source-node' },
      });

      expect(result.observation.type).toBe('sensor1.temperature2');
    });
  });

  describe('provenance validation', () => {
    it('should reject missing provenance', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: undefined as unknown as { sourceId: string },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject null provenance', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: null as unknown as { sourceId: string },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject missing sourceId', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: {} as { sourceId: string },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject empty sourceId', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: '   ' },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject non-string sourceId', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 123 as unknown as string },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject non-number confidence', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: {
            sourceId: 'source-node',
            confidence: 'high' as unknown as number,
          },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject confidence less than 0', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node', confidence: -0.1 },
        })
      ).rejects.toThrow(ProvenanceError);
    });

    it('should reject confidence greater than 1', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node', confidence: 1.1 },
        })
      ).rejects.toThrow(ProvenanceError);
    });
  });

  describe('required field validation', () => {
    it('should reject missing nodeId', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: '',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject undefined payload', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: undefined as unknown as object,
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid timestamp format', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
          timestamp: 'not-a-date',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject non-array tags', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
          tags: 'tag' as unknown as string[],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject non-string tag in array', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
          tags: ['valid', 123 as unknown as string],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('node validation', () => {
    it('should reject non-existent node', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'non-existent-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        })
      ).rejects.toThrow(NodeNotFoundError);
    });

    it('should reject non-existent source node', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'non-existent-source' },
        })
      ).rejects.toThrow(NodeNotFoundError);
    });

    it('should reject non-existent sponsor node', async () => {
      await expect(
        ingestObservation(repos, {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: {
            sourceId: 'agent-node',
            sponsorId: 'non-existent-sponsor',
          },
        })
      ).rejects.toThrow(NodeNotFoundError);
    });

    it('should skip node validation when disabled', async () => {
      const result = await ingestObservation(
        repos,
        {
          nodeId: 'non-existent-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'also-non-existent' },
        },
        { validateNode: false, validateSource: false }
      );

      expect(result.observation.nodeId).toBe('non-existent-node');
    });
  });
});

describe('ingestObservations (batch)', () => {
  let repos: RepositoryContext;

  beforeEach(() => {
    repos = createTestRepositoryContext();
  });

  it('should ingest multiple valid observations', async () => {
    const results = await ingestObservations(repos, [
      {
        nodeId: 'test-node',
        type: 'health.sleep',
        payload: { hours: 7 },
        provenance: { sourceId: 'source-node' },
      },
      {
        nodeId: 'test-node',
        type: 'health.exercise',
        payload: { minutes: 30 },
        provenance: { sourceId: 'source-node' },
      },
    ]);

    expect(results.length).toBe(2);
    expect(results[0].observation.type).toBe('health.sleep');
    expect(results[1].observation.type).toBe('health.exercise');
  });

  it('should fail all if any observation is invalid', async () => {
    await expect(
      ingestObservations(repos, [
        {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: { hours: 7 },
          provenance: { sourceId: 'source-node' },
        },
        {
          nodeId: 'test-node',
          type: '', // Invalid
          payload: { minutes: 30 },
          provenance: { sourceId: 'source-node' },
        },
      ])
    ).rejects.toThrow(ValidationError);
  });

  it('should include index in validation error', async () => {
    try {
      await ingestObservations(repos, [
        {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: { hours: 7 },
          provenance: { sourceId: 'source-node' },
        },
        {
          nodeId: 'test-node',
          type: 'Invalid.Type', // Invalid - uppercase
          payload: {},
          provenance: { sourceId: 'source-node' },
        },
      ]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('index 1');
    }
  });

  it('should validate all unique nodes in batch', async () => {
    await expect(
      ingestObservations(repos, [
        {
          nodeId: 'test-node',
          type: 'health.sleep',
          payload: {},
          provenance: { sourceId: 'source-node' },
        },
        {
          nodeId: 'non-existent-node',
          type: 'health.exercise',
          payload: {},
          provenance: { sourceId: 'source-node' },
        },
      ])
    ).rejects.toThrow(NodeNotFoundError);
  });

  it('should return empty array for empty input', async () => {
    const results = await ingestObservations(repos, []);
    expect(results).toEqual([]);
  });
});
