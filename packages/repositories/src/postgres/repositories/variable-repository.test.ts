// Tests for Variable Repository (Phase 4.1)
// Verifies variable lifecycle: create, read, update, delete, and ComputeSpec management.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Variable, ComputeSpec, VariableKind, ViableRange } from '@omnilith/protocol';
import type {
  VariableRepository,
  CreateVariableInput,
  UpdateVariableInput,
  VariableFilter,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemoryVariableRepository(): VariableRepository & { clear(): void } {
  const variables = new Map<string, Variable>();

  return {
    async create(input: CreateVariableInput): Promise<Variable> {
      const id = input.id ?? `var-${variables.size + 1}`;
      const now = new Date().toISOString();
      const variable: Variable = {
        id,
        nodeId: input.nodeId,
        key: input.key,
        title: input.title,
        description: input.description,
        kind: input.kind,
        unit: input.unit,
        viableRange: input.viableRange,
        preferredRange: input.preferredRange,
        computeSpecs: input.computeSpecs ?? [],
        prior: input.prior,
        target: input.target,
        createdAt: now,
        updatedAt: now,
      };
      variables.set(id, variable);
      return variable;
    },

    async get(id: string): Promise<Variable | null> {
      return variables.get(id) ?? null;
    },

    async getByKey(nodeId: string, key: string): Promise<Variable | null> {
      for (const variable of variables.values()) {
        if (variable.nodeId === nodeId && variable.key === key) {
          return variable;
        }
      }
      return null;
    },

    async list(filter?: VariableFilter): Promise<Variable[]> {
      let result = Array.from(variables.values());

      if (filter?.nodeId) {
        result = result.filter((v) => v.nodeId === filter.nodeId);
      }
      if (filter?.kind) {
        result = result.filter((v) => v.kind === filter.kind);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      if (filter?.offset) {
        result = result.slice(filter.offset);
      }

      return result;
    },

    async update(id: string, input: UpdateVariableInput): Promise<Variable | null> {
      const variable = variables.get(id);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        title: input.title ?? variable.title,
        description: input.description !== undefined ? input.description : variable.description,
        unit: input.unit !== undefined ? input.unit : variable.unit,
        viableRange: input.viableRange !== undefined ? input.viableRange : variable.viableRange,
        preferredRange: input.preferredRange !== undefined ? input.preferredRange : variable.preferredRange,
        prior: input.prior !== undefined ? input.prior : variable.prior,
        target: input.target !== undefined ? input.target : variable.target,
        updatedAt: new Date().toISOString(),
      };

      variables.set(id, updated);
      return updated;
    },

    async addComputeSpec(variableId: string, spec: ComputeSpec): Promise<Variable | null> {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: [...variable.computeSpecs, spec],
        updatedAt: new Date().toISOString(),
      };

      variables.set(variableId, updated);
      return updated;
    },

    async updateComputeSpec(
      variableId: string,
      specId: string,
      spec: Partial<ComputeSpec>
    ): Promise<Variable | null> {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: variable.computeSpecs.map((s) =>
          s.id === specId ? { ...s, ...spec } : s
        ),
        updatedAt: new Date().toISOString(),
      };

      variables.set(variableId, updated);
      return updated;
    },

    async removeComputeSpec(variableId: string, specId: string): Promise<Variable | null> {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: variable.computeSpecs.filter((s) => s.id !== specId),
        updatedAt: new Date().toISOString(),
      };

      variables.set(variableId, updated);
      return updated;
    },

    async getByNode(nodeId: string): Promise<Variable[]> {
      return Array.from(variables.values()).filter((v) => v.nodeId === nodeId);
    },

    clear() {
      variables.clear();
    },
  };
}

// --- Test Fixtures ---

function createTestComputeSpec(overrides: Partial<ComputeSpec> = {}): ComputeSpec {
  return {
    id: overrides.id ?? `spec-${Math.random().toString(36).slice(2)}`,
    observationTypes: overrides.observationTypes ?? ['health.sleep'],
    aggregation: overrides.aggregation ?? 'avg',
    window: overrides.window,
    confidence: overrides.confidence,
  };
}


// --- Tests ---

describe('VariableRepository', () => {
  let repo: ReturnType<typeof createInMemoryVariableRepository>;

  beforeEach(() => {
    repo = createInMemoryVariableRepository();
  });

  describe('create', () => {
    it('creates a variable with minimal required fields', async () => {
      const variable = await repo.create({
        nodeId: 'node-1',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
      });

      expect(variable.id).toBeDefined();
      expect(variable.nodeId).toBe('node-1');
      expect(variable.key).toBe('sleep_quality');
      expect(variable.title).toBe('Sleep Quality');
      expect(variable.kind).toBe('continuous');
      expect(variable.computeSpecs).toEqual([]);
      expect(variable.createdAt).toBeDefined();
      expect(variable.updatedAt).toBeDefined();
    });

    it('creates a variable with viable and preferred ranges', async () => {
      const viableRange: ViableRange = { min: 4, max: 12, note: 'Acceptable sleep hours' };
      const preferredRange: ViableRange = { min: 7, max: 9, note: 'Optimal sleep hours' };

      const variable = await repo.create({
        nodeId: 'node-1',
        key: 'sleep_hours',
        title: 'Sleep Hours',
        kind: 'continuous',
        unit: 'hours',
        viableRange,
        preferredRange,
      });

      expect(variable.viableRange).toEqual(viableRange);
      expect(variable.preferredRange).toEqual(preferredRange);
      expect(variable.unit).toBe('hours');
    });

    it('creates a variable with initial compute specs', async () => {
      const computeSpec = createTestComputeSpec({
        id: 'spec-1',
        observationTypes: ['health.sleep.hours'],
        aggregation: 'avg',
        window: { hours: 168 }, // 1 week
      });

      const variable = await repo.create({
        nodeId: 'node-1',
        key: 'sleep_avg',
        title: 'Average Sleep',
        kind: 'continuous',
        computeSpecs: [computeSpec],
      });

      expect(variable.computeSpecs).toHaveLength(1);
      expect(variable.computeSpecs[0]).toEqual(computeSpec);
    });

    it('creates variables of all kinds', async () => {
      const kinds: VariableKind[] = ['continuous', 'ordinal', 'categorical', 'boolean'];

      for (const kind of kinds) {
        const variable = await repo.create({
          nodeId: 'node-1',
          key: `test_${kind}`,
          title: `Test ${kind}`,
          kind,
        });

        expect(variable.kind).toBe(kind);
      }
    });

    it('uses provided id when specified', async () => {
      const variable = await repo.create({
        id: 'custom-id-123',
        nodeId: 'node-1',
        key: 'custom_var',
        title: 'Custom Variable',
        kind: 'boolean',
      });

      expect(variable.id).toBe('custom-id-123');
    });

    it('creates a variable with soft bounds in ranges', async () => {
      const viableRange: ViableRange = {
        min: 4,
        max: 12,
        softMin: 5,
        softMax: 11,
      };

      const variable = await repo.create({
        nodeId: 'node-1',
        key: 'sleep_with_soft_bounds',
        title: 'Sleep with Soft Bounds',
        kind: 'continuous',
        viableRange,
      });

      expect(variable.viableRange?.softMin).toBe(5);
      expect(variable.viableRange?.softMax).toBe(11);
    });

    it('creates a variable with prior and target', async () => {
      const variable = await repo.create({
        nodeId: 'node-1',
        key: 'with_prior',
        title: 'Variable with Prior',
        kind: 'continuous',
        prior: { mean: 7, variance: 1 },
        target: { value: 8 },
      });

      expect(variable.prior).toEqual({ mean: 7, variance: 1 });
      expect(variable.target).toEqual({ value: 8 });
    });
  });

  describe('get', () => {
    it('returns a variable by id', async () => {
      const created = await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'test_var',
        title: 'Test Variable',
        kind: 'continuous',
      });

      const retrieved = await repo.get('var-1');

      expect(retrieved).toEqual(created);
    });

    it('returns null for non-existent variable', async () => {
      const result = await repo.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getByKey', () => {
    it('returns a variable by node id and key', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
      });

      const result = await repo.getByKey('node-1', 'sleep_quality');

      expect(result).toBeDefined();
      expect(result?.id).toBe('var-1');
      expect(result?.key).toBe('sleep_quality');
    });

    it('returns null when key not found in node', async () => {
      await repo.create({
        nodeId: 'node-1',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
      });

      const result = await repo.getByKey('node-1', 'non_existent_key');

      expect(result).toBeNull();
    });

    it('returns null when key exists in different node', async () => {
      await repo.create({
        nodeId: 'node-1',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
      });

      const result = await repo.getByKey('node-2', 'sleep_quality');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await repo.create({
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });
      await repo.create({
        nodeId: 'node-1',
        key: 'exercise',
        title: 'Exercise',
        kind: 'ordinal',
      });
      await repo.create({
        nodeId: 'node-2',
        key: 'mood',
        title: 'Mood',
        kind: 'categorical',
      });
    });

    it('returns all variables when no filter', async () => {
      const result = await repo.list();

      expect(result).toHaveLength(3);
    });

    it('filters by nodeId', async () => {
      const result = await repo.list({ nodeId: 'node-1' });

      expect(result).toHaveLength(2);
      expect(result.every((v) => v.nodeId === 'node-1')).toBe(true);
    });

    it('filters by kind', async () => {
      const result = await repo.list({ kind: 'continuous' });

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('continuous');
    });

    it('applies limit', async () => {
      const result = await repo.list({ limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('applies offset', async () => {
      const result = await repo.list({ offset: 1 });

      expect(result).toHaveLength(2);
    });

    it('combines filters', async () => {
      const result = await repo.list({ nodeId: 'node-1', limit: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].nodeId).toBe('node-1');
    });
  });

  describe('update', () => {
    it('updates variable title', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      const updated = await repo.update('var-1', { title: 'Sleep Quality' });

      expect(updated?.title).toBe('Sleep Quality');
    });

    it('updates viable range', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
        viableRange: { min: 0, max: 10 },
      });

      const newRange: ViableRange = { min: 4, max: 12 };
      const updated = await repo.update('var-1', { viableRange: newRange });

      expect(updated?.viableRange).toEqual(newRange);
    });

    it('updates preferred range', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      const newRange: ViableRange = { min: 7, max: 9 };
      const updated = await repo.update('var-1', { preferredRange: newRange });

      expect(updated?.preferredRange).toEqual(newRange);
    });

    it('updates unit', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      const updated = await repo.update('var-1', { unit: 'hours' });

      expect(updated?.unit).toBe('hours');
    });

    it('updates description', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      const updated = await repo.update('var-1', { description: 'Track sleep quality' });

      expect(updated?.description).toBe('Track sleep quality');
    });

    it('updates prior and target', async () => {
      await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      const updated = await repo.update('var-1', {
        prior: { mean: 7 },
        target: { value: 8 },
      });

      expect(updated?.prior).toEqual({ mean: 7 });
      expect(updated?.target).toEqual({ value: 8 });
    });

    it('returns null for non-existent variable', async () => {
      const result = await repo.update('non-existent', { title: 'New Title' });

      expect(result).toBeNull();
    });

    it('updates updatedAt timestamp', async () => {
      const created = await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update('var-1', { title: 'Sleep Quality' });

      expect(updated?.updatedAt).not.toBe(created.updatedAt);
    });
  });

  describe('ComputeSpec operations', () => {
    let variableId: string;

    beforeEach(async () => {
      const variable = await repo.create({
        id: 'var-1',
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });
      variableId = variable.id;
    });

    describe('addComputeSpec', () => {
      it('adds a compute spec to a variable', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1' });

        const updated = await repo.addComputeSpec(variableId, spec);

        expect(updated?.computeSpecs).toHaveLength(1);
        expect(updated?.computeSpecs[0]).toEqual(spec);
      });

      it('adds multiple compute specs', async () => {
        const spec1 = createTestComputeSpec({ id: 'spec-1' });
        const spec2 = createTestComputeSpec({
          id: 'spec-2',
          observationTypes: ['health.exercise'],
        });

        await repo.addComputeSpec(variableId, spec1);
        const updated = await repo.addComputeSpec(variableId, spec2);

        expect(updated?.computeSpecs).toHaveLength(2);
      });

      it('returns null for non-existent variable', async () => {
        const spec = createTestComputeSpec();

        const result = await repo.addComputeSpec('non-existent', spec);

        expect(result).toBeNull();
      });

      it('preserves existing compute specs when adding new one', async () => {
        const spec1 = createTestComputeSpec({ id: 'spec-1' });
        const spec2 = createTestComputeSpec({ id: 'spec-2' });

        await repo.addComputeSpec(variableId, spec1);
        const updated = await repo.addComputeSpec(variableId, spec2);

        expect(updated?.computeSpecs[0]).toEqual(spec1);
        expect(updated?.computeSpecs[1]).toEqual(spec2);
      });

      it('adds compute spec with all aggregation methods', async () => {
        const aggregations = ['latest', 'sum', 'avg', 'count', 'min', 'max'] as const;

        for (let i = 0; i < aggregations.length; i++) {
          const spec = createTestComputeSpec({
            id: `spec-${i}`,
            aggregation: aggregations[i],
          });
          await repo.addComputeSpec(variableId, spec);
        }

        const variable = await repo.get(variableId);
        expect(variable?.computeSpecs).toHaveLength(aggregations.length);
      });

      it('adds compute spec with window configuration', async () => {
        const spec = createTestComputeSpec({
          id: 'spec-windowed',
          window: { hours: 24, count: 10 },
        });

        const updated = await repo.addComputeSpec(variableId, spec);

        expect(updated?.computeSpecs[0].window).toEqual({ hours: 24, count: 10 });
      });

      it('adds compute spec with confidence', async () => {
        const spec = createTestComputeSpec({
          id: 'spec-confidence',
          confidence: 0.85,
        });

        const updated = await repo.addComputeSpec(variableId, spec);

        expect(updated?.computeSpecs[0].confidence).toBe(0.85);
      });
    });

    describe('updateComputeSpec', () => {
      it('updates aggregation method', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1', aggregation: 'avg' });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          aggregation: 'latest',
        });

        expect(updated?.computeSpecs[0].aggregation).toBe('latest');
      });

      it('updates observation types', async () => {
        const spec = createTestComputeSpec({
          id: 'spec-1',
          observationTypes: ['health.sleep'],
        });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          observationTypes: ['health.sleep', 'health.rest'],
        });

        expect(updated?.computeSpecs[0].observationTypes).toEqual([
          'health.sleep',
          'health.rest',
        ]);
      });

      it('updates window configuration', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1', window: { hours: 24 } });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          window: { hours: 168, count: 7 },
        });

        expect(updated?.computeSpecs[0].window).toEqual({ hours: 168, count: 7 });
      });

      it('updates confidence', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1', confidence: 0.5 });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          confidence: 0.9,
        });

        expect(updated?.computeSpecs[0].confidence).toBe(0.9);
      });

      it('only updates specified spec', async () => {
        const spec1 = createTestComputeSpec({ id: 'spec-1', aggregation: 'avg' });
        const spec2 = createTestComputeSpec({ id: 'spec-2', aggregation: 'sum' });
        await repo.addComputeSpec(variableId, spec1);
        await repo.addComputeSpec(variableId, spec2);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          aggregation: 'latest',
        });

        expect(updated?.computeSpecs[0].aggregation).toBe('latest');
        expect(updated?.computeSpecs[1].aggregation).toBe('sum');
      });

      it('returns null for non-existent variable', async () => {
        const result = await repo.updateComputeSpec('non-existent', 'spec-1', {
          aggregation: 'sum',
        });

        expect(result).toBeNull();
      });

      it('preserves spec id when updating other fields', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1' });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.updateComputeSpec(variableId, 'spec-1', {
          aggregation: 'sum',
        });

        expect(updated?.computeSpecs[0].id).toBe('spec-1');
      });
    });

    describe('removeComputeSpec', () => {
      it('removes a compute spec by id', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1' });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.removeComputeSpec(variableId, 'spec-1');

        expect(updated?.computeSpecs).toHaveLength(0);
      });

      it('only removes the specified spec', async () => {
        const spec1 = createTestComputeSpec({ id: 'spec-1' });
        const spec2 = createTestComputeSpec({ id: 'spec-2' });
        await repo.addComputeSpec(variableId, spec1);
        await repo.addComputeSpec(variableId, spec2);

        const updated = await repo.removeComputeSpec(variableId, 'spec-1');

        expect(updated?.computeSpecs).toHaveLength(1);
        expect(updated?.computeSpecs[0].id).toBe('spec-2');
      });

      it('returns null for non-existent variable', async () => {
        const result = await repo.removeComputeSpec('non-existent', 'spec-1');

        expect(result).toBeNull();
      });

      it('handles removing non-existent spec gracefully', async () => {
        const spec = createTestComputeSpec({ id: 'spec-1' });
        await repo.addComputeSpec(variableId, spec);

        const updated = await repo.removeComputeSpec(variableId, 'non-existent-spec');

        expect(updated?.computeSpecs).toHaveLength(1);
        expect(updated?.computeSpecs[0].id).toBe('spec-1');
      });
    });
  });

  describe('getByNode', () => {
    it('returns all variables for a node', async () => {
      await repo.create({
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep',
        kind: 'continuous',
      });
      await repo.create({
        nodeId: 'node-1',
        key: 'exercise',
        title: 'Exercise',
        kind: 'ordinal',
      });
      await repo.create({
        nodeId: 'node-2',
        key: 'mood',
        title: 'Mood',
        kind: 'categorical',
      });

      const result = await repo.getByNode('node-1');

      expect(result).toHaveLength(2);
      expect(result.every((v) => v.nodeId === 'node-1')).toBe(true);
    });

    it('returns empty array for node with no variables', async () => {
      const result = await repo.getByNode('node-without-variables');

      expect(result).toEqual([]);
    });
  });

  describe('Variable lifecycle integration', () => {
    it('supports full variable lifecycle', async () => {
      // 1. Create variable
      const created = await repo.create({
        id: 'sleep-var',
        nodeId: 'personal-node',
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
        unit: 'score',
        viableRange: { min: 1, max: 10 },
        preferredRange: { min: 7, max: 9 },
      });

      expect(created.id).toBe('sleep-var');

      // 2. Add compute spec
      const withSpec = await repo.addComputeSpec('sleep-var', {
        id: 'sleep-spec-1',
        observationTypes: ['health.sleep.quality'],
        aggregation: 'avg',
        window: { hours: 168 }, // 1 week
        confidence: 0.8,
      });

      expect(withSpec?.computeSpecs).toHaveLength(1);

      // 3. Update variable properties
      const updated = await repo.update('sleep-var', {
        title: 'Sleep Quality Score',
        description: 'Tracks overall sleep quality on a 1-10 scale',
      });

      expect(updated?.title).toBe('Sleep Quality Score');
      expect(updated?.description).toBe('Tracks overall sleep quality on a 1-10 scale');

      // 4. Update compute spec
      const specUpdated = await repo.updateComputeSpec('sleep-var', 'sleep-spec-1', {
        window: { hours: 336 }, // 2 weeks
        confidence: 0.85,
      });

      expect(specUpdated?.computeSpecs[0].window?.hours).toBe(336);

      // 5. Add another compute spec
      const withSecondSpec = await repo.addComputeSpec('sleep-var', {
        id: 'sleep-spec-2',
        observationTypes: ['health.sleep.duration'],
        aggregation: 'latest',
      });

      expect(withSecondSpec?.computeSpecs).toHaveLength(2);

      // 6. Query variable
      const byKey = await repo.getByKey('personal-node', 'sleep_quality');
      expect(byKey?.id).toBe('sleep-var');

      const byNode = await repo.getByNode('personal-node');
      expect(byNode).toHaveLength(1);

      // 7. Remove a compute spec
      const specRemoved = await repo.removeComputeSpec('sleep-var', 'sleep-spec-1');
      expect(specRemoved?.computeSpecs).toHaveLength(1);
      expect(specRemoved?.computeSpecs[0].id).toBe('sleep-spec-2');

      // 8. Final state verification
      const finalState = await repo.get('sleep-var');
      expect(finalState).toBeDefined();
      expect(finalState?.title).toBe('Sleep Quality Score');
      expect(finalState?.computeSpecs).toHaveLength(1);
      expect(finalState?.viableRange).toEqual({ min: 1, max: 10 });
      expect(finalState?.preferredRange).toEqual({ min: 7, max: 9 });
    });

    it('supports multiple nodes with independent variables', async () => {
      // Create variables for node-1
      await repo.create({
        nodeId: 'node-1',
        key: 'sleep',
        title: 'Sleep (Node 1)',
        kind: 'continuous',
      });
      await repo.create({
        nodeId: 'node-1',
        key: 'exercise',
        title: 'Exercise (Node 1)',
        kind: 'ordinal',
      });

      // Create variables for node-2 (same keys, different node)
      await repo.create({
        nodeId: 'node-2',
        key: 'sleep',
        title: 'Sleep (Node 2)',
        kind: 'continuous',
      });

      // Verify isolation
      const node1Vars = await repo.getByNode('node-1');
      const node2Vars = await repo.getByNode('node-2');

      expect(node1Vars).toHaveLength(2);
      expect(node2Vars).toHaveLength(1);

      // Verify key lookup is node-scoped
      const node1Sleep = await repo.getByKey('node-1', 'sleep');
      const node2Sleep = await repo.getByKey('node-2', 'sleep');

      expect(node1Sleep?.title).toBe('Sleep (Node 1)');
      expect(node2Sleep?.title).toBe('Sleep (Node 2)');
    });
  });
});
