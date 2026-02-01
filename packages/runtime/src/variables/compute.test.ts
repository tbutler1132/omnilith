// Tests for ComputeSpec evaluation

import { describe, it, expect } from 'vitest';
import type { ComputeSpec, Observation } from '@omnilith/protocol';
import {
  evaluateComputeSpec,
  evaluateComputeSpecs,
  matchesObservationType,
  filterByObservationTypes,
  filterByTimeWindow,
  applyCountLimit,
  extractNumericValue,
  aggregate,
} from './compute.js';

// Helper to create test observations
function createObservation(
  id: string,
  type: string,
  payload: unknown,
  timestamp: string
): Observation {
  return {
    id,
    nodeId: 'test-node',
    type,
    timestamp,
    payload,
    provenance: {
      sourceId: 'test-source',
      method: 'manual_entry',
    },
  };
}

// Helper to create timestamps relative to a reference time
function hoursAgo(hours: number, reference: Date = new Date()): string {
  return new Date(reference.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe('matchesObservationType', () => {
  it('matches exact type', () => {
    expect(matchesObservationType('health.sleep', 'health.sleep')).toBe(true);
    expect(matchesObservationType('health.sleep', 'health.exercise')).toBe(false);
  });

  it('matches prefix with wildcard', () => {
    expect(matchesObservationType('health.sleep', 'health.*')).toBe(true);
    expect(matchesObservationType('health.exercise', 'health.*')).toBe(true);
    expect(matchesObservationType('health.sleep.quality', 'health.*')).toBe(true);
    expect(matchesObservationType('work.task', 'health.*')).toBe(false);
  });

  it('does not match prefix without wildcard (per spec)', () => {
    // Per spec §8.1.2: patterns are "exact match or prefix with *"
    // Without wildcard, only exact match applies
    expect(matchesObservationType('health.sleep', 'health')).toBe(false);
    expect(matchesObservationType('health.sleep.quality', 'health')).toBe(false);
    expect(matchesObservationType('healthcare', 'health')).toBe(false);
    expect(matchesObservationType('health', 'health')).toBe(true); // Exact match works
  });

  it('handles edge cases', () => {
    expect(matchesObservationType('', '')).toBe(true);
    expect(matchesObservationType('a', 'a')).toBe(true);
    expect(matchesObservationType('a.b', 'a.*')).toBe(true);
    expect(matchesObservationType('ab', 'a.*')).toBe(false);
    // Wildcard at base level
    expect(matchesObservationType('a', 'a.*')).toBe(true);
  });
});

describe('filterByObservationTypes', () => {
  const observations: Observation[] = [
    createObservation('1', 'health.sleep', { hours: 7 }, '2024-01-01T00:00:00Z'),
    createObservation('2', 'health.exercise', { minutes: 30 }, '2024-01-01T01:00:00Z'),
    createObservation('3', 'work.task', { completed: true }, '2024-01-01T02:00:00Z'),
    createObservation('4', 'health.sleep.quality', { score: 8 }, '2024-01-01T03:00:00Z'),
  ];

  it('filters by single exact type', () => {
    const result = filterByObservationTypes(observations, ['health.sleep']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by multiple types', () => {
    const result = filterByObservationTypes(observations, ['health.sleep', 'health.exercise']);
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.id)).toEqual(['1', '2']);
  });

  it('filters by wildcard pattern', () => {
    const result = filterByObservationTypes(observations, ['health.*']);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.id)).toEqual(['1', '2', '4']);
  });

  it('returns empty array for no patterns', () => {
    const result = filterByObservationTypes(observations, []);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for non-matching patterns', () => {
    const result = filterByObservationTypes(observations, ['mood.journal']);
    expect(result).toHaveLength(0);
  });
});

describe('filterByTimeWindow', () => {
  const referenceTime = new Date('2024-01-10T12:00:00Z');

  const observations: Observation[] = [
    createObservation('1', 'test', 1, '2024-01-10T11:00:00Z'), // 1 hour ago
    createObservation('2', 'test', 2, '2024-01-10T06:00:00Z'), // 6 hours ago
    createObservation('3', 'test', 3, '2024-01-09T12:00:00Z'), // 24 hours ago
    createObservation('4', 'test', 4, '2024-01-08T12:00:00Z'), // 48 hours ago
  ];

  it('filters observations within window', () => {
    const result = filterByTimeWindow(observations, 12, referenceTime);
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.id)).toEqual(['1', '2']);
  });

  it('returns all observations for large window', () => {
    const result = filterByTimeWindow(observations, 100, referenceTime);
    expect(result).toHaveLength(4);
  });

  it('returns empty array for small window', () => {
    const result = filterByTimeWindow(observations, 0.5, referenceTime);
    expect(result).toHaveLength(0);
  });

  it('includes observation exactly at boundary', () => {
    const result = filterByTimeWindow(observations, 24, referenceTime);
    expect(result).toHaveLength(3);
  });
});

describe('applyCountLimit', () => {
  const observations: Observation[] = [
    createObservation('1', 'test', 1, '2024-01-01T00:00:00Z'),
    createObservation('2', 'test', 2, '2024-01-01T01:00:00Z'),
    createObservation('3', 'test', 3, '2024-01-01T02:00:00Z'),
    createObservation('4', 'test', 4, '2024-01-01T03:00:00Z'),
  ];

  it('limits to specified count, taking most recent', () => {
    const result = applyCountLimit(observations, 2);
    expect(result).toHaveLength(2);
    // Most recent first
    expect(result.map((o) => o.id)).toEqual(['4', '3']);
  });

  it('returns all if count exceeds length', () => {
    const result = applyCountLimit(observations, 10);
    expect(result).toHaveLength(4);
  });

  it('returns empty for count of 0', () => {
    const result = applyCountLimit(observations, 0);
    expect(result).toHaveLength(0);
  });
});

describe('extractNumericValue', () => {
  it('extracts direct number', () => {
    expect(extractNumericValue(42)).toBe(42);
    expect(extractNumericValue(3.14)).toBe(3.14);
    expect(extractNumericValue(0)).toBe(0);
    expect(extractNumericValue(-5)).toBe(-5);
  });

  it('extracts from object with "value" field', () => {
    expect(extractNumericValue({ value: 42 })).toBe(42);
    expect(extractNumericValue({ value: 0 })).toBe(0);
  });

  it('extracts from object with "amount" field', () => {
    expect(extractNumericValue({ amount: 100 })).toBe(100);
  });

  it('extracts from object with "score" field', () => {
    expect(extractNumericValue({ score: 8.5 })).toBe(8.5);
  });

  it('extracts from object with "hours" field', () => {
    expect(extractNumericValue({ hours: 7.5 })).toBe(7.5);
  });

  it('extracts from object with "duration" field', () => {
    expect(extractNumericValue({ duration: 30 })).toBe(30);
  });

  it('extracts from object with "minutes" field', () => {
    expect(extractNumericValue({ minutes: 45 })).toBe(45);
  });

  it('extracts from object with "count" field', () => {
    expect(extractNumericValue({ count: 5 })).toBe(5);
  });

  it('returns undefined for non-numeric', () => {
    expect(extractNumericValue('string')).toBeUndefined();
    expect(extractNumericValue(null)).toBeUndefined();
    expect(extractNumericValue(undefined)).toBeUndefined();
    expect(extractNumericValue({})).toBeUndefined();
    expect(extractNumericValue({ other: 'field' })).toBeUndefined();
    expect(extractNumericValue({ value: 'not a number' })).toBeUndefined();
  });
});

describe('aggregate', () => {
  describe('latest', () => {
    it('returns first value (most recent)', () => {
      expect(aggregate([10, 20, 30], 'latest')).toBe(10);
    });

    it('handles single value', () => {
      expect(aggregate([42], 'latest')).toBe(42);
    });
  });

  describe('sum', () => {
    it('sums values', () => {
      expect(aggregate([1, 2, 3], 'sum')).toBe(6);
    });

    it('handles negative values', () => {
      expect(aggregate([10, -3, 5], 'sum')).toBe(12);
    });
  });

  describe('avg', () => {
    it('averages values', () => {
      expect(aggregate([2, 4, 6], 'avg')).toBe(4);
    });

    it('handles single value', () => {
      expect(aggregate([5], 'avg')).toBe(5);
    });

    it('handles decimal result', () => {
      expect(aggregate([1, 2], 'avg')).toBe(1.5);
    });
  });

  describe('count', () => {
    it('counts values', () => {
      expect(aggregate([1, 2, 3, 4], 'count')).toBe(4);
    });

    it('counts single value', () => {
      expect(aggregate([42], 'count')).toBe(1);
    });
  });

  describe('min', () => {
    it('finds minimum', () => {
      expect(aggregate([5, 2, 8, 1, 9], 'min')).toBe(1);
    });

    it('handles negative values', () => {
      expect(aggregate([5, -2, 8], 'min')).toBe(-2);
    });
  });

  describe('max', () => {
    it('finds maximum', () => {
      expect(aggregate([5, 2, 8, 1, 9], 'max')).toBe(9);
    });

    it('handles negative values', () => {
      expect(aggregate([-5, -2, -8], 'max')).toBe(-2);
    });
  });

  it('returns undefined for empty array', () => {
    expect(aggregate([], 'sum')).toBeUndefined();
    expect(aggregate([], 'avg')).toBeUndefined();
    expect(aggregate([], 'latest')).toBeUndefined();
  });
});

describe('evaluateComputeSpec', () => {
  const referenceTime = new Date('2024-01-10T12:00:00Z');

  const sleepObservations: Observation[] = [
    createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(2, referenceTime)),
    createObservation('2', 'health.sleep', { hours: 6 }, hoursAgo(26, referenceTime)),
    createObservation('3', 'health.sleep', { hours: 8 }, hoursAgo(50, referenceTime)),
    createObservation('4', 'health.sleep', { hours: 5 }, hoursAgo(74, referenceTime)),
  ];

  describe('basic aggregation', () => {
    it('computes latest value', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'latest',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(7); // Most recent observation
      expect(result.usedCount).toBe(4);
      expect(result.matchedCount).toBe(4);
    });

    it('computes sum', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'sum',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(26); // 7 + 6 + 8 + 5
    });

    it('computes average', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(6.5); // (7 + 6 + 8 + 5) / 4
    });

    it('computes count', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(4);
    });

    it('computes min', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'min',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(5);
    });

    it('computes max', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'max',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(8);
    });
  });

  describe('time window filtering', () => {
    it('filters by hours window', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { hours: 24 },
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(7); // Only the most recent observation is within 24 hours
      expect(result.usedCount).toBe(1);
      expect(result.matchedCount).toBe(4);
    });

    it('applies 48 hour window', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { hours: 48 },
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(6.5); // (7 + 6) / 2
      expect(result.usedCount).toBe(2);
    });
  });

  describe('count limit', () => {
    it('limits to N most recent observations', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { count: 2 },
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(6.5); // (7 + 6) / 2 - two most recent
      expect(result.usedCount).toBe(2);
    });

    it('applies time filter before count limit', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { hours: 48, count: 1 },
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(7); // Only most recent of the two within 48h
      expect(result.usedCount).toBe(1);
    });
  });

  describe('type filtering', () => {
    const mixedObservations: Observation[] = [
      createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
      createObservation('2', 'health.exercise', { minutes: 30 }, hoursAgo(2, referenceTime)),
      createObservation('3', 'health.sleep.quality', { score: 8 }, hoursAgo(3, referenceTime)),
      createObservation('4', 'work.task', { count: 5 }, hoursAgo(4, referenceTime)),
    ];

    it('filters by exact type', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, mixedObservations, referenceTime);
      expect(result.value).toBe(1);
    });

    it('filters by wildcard type', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.*'],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, mixedObservations, referenceTime);
      expect(result.value).toBe(3);
    });

    it('filters by multiple types', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep', 'work.task'],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, mixedObservations, referenceTime);
      expect(result.value).toBe(2);
    });
  });

  describe('confidence calculation', () => {
    it('uses spec confidence', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        confidence: 0.8,
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.confidence).toBe(0.8);
    });

    it('defaults confidence to 1.0', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.confidence).toBe(1.0);
    });

    it('sets confidence to 0 for no observations', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['mood.journal'],
        aggregation: 'avg',
        confidence: 0.9,
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.confidence).toBe(0);
      expect(result.value).toBeUndefined();
    });

    it('reduces confidence when fewer observations than count limit', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { count: 10 },
        confidence: 1.0,
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      // 4 observations when 10 expected: 0.5 + 0.5 * (4/10) = 0.7
      expect(result.confidence).toBe(0.7);
    });

    it('reduces confidence when values cannot be extracted', () => {
      const nonNumericObs: Observation[] = [
        createObservation('1', 'health.sleep', { status: 'good' }, hoursAgo(1, referenceTime)),
        createObservation('2', 'health.sleep', { hours: 7 }, hoursAgo(2, referenceTime)),
      ];

      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        confidence: 1.0,
      };

      const result = evaluateComputeSpec(spec, nonNumericObs, referenceTime);
      // 1 of 2 observations had extractable values: 1.0 * 0.5 = 0.5
      expect(result.confidence).toBe(0.5);
      expect(result.value).toBe(7);
    });
  });

  describe('edge cases', () => {
    it('handles empty observations array', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
      };

      const result = evaluateComputeSpec(spec, [], referenceTime);
      expect(result.value).toBeUndefined();
      expect(result.confidence).toBe(0);
      expect(result.matchedCount).toBe(0);
      expect(result.usedCount).toBe(0);
    });

    it('handles empty observation types array', () => {
      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: [],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, sleepObservations, referenceTime);
      expect(result.value).toBe(0);
      expect(result.matchedCount).toBe(0);
    });

    it('handles direct number payloads', () => {
      const numericObs: Observation[] = [
        createObservation('1', 'metric', 10, hoursAgo(1, referenceTime)),
        createObservation('2', 'metric', 20, hoursAgo(2, referenceTime)),
        createObservation('3', 'metric', 30, hoursAgo(3, referenceTime)),
      ];

      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['metric'],
        aggregation: 'sum',
      };

      const result = evaluateComputeSpec(spec, numericObs, referenceTime);
      expect(result.value).toBe(60);
    });

    it('count aggregation works even without numeric values', () => {
      const stringObs: Observation[] = [
        createObservation('1', 'event', { message: 'hello' }, hoursAgo(1, referenceTime)),
        createObservation('2', 'event', { message: 'world' }, hoursAgo(2, referenceTime)),
      ];

      const spec: ComputeSpec = {
        id: 'spec-1',
        observationTypes: ['event'],
        aggregation: 'count',
      };

      const result = evaluateComputeSpec(spec, stringObs, referenceTime);
      expect(result.value).toBe(2);
    });
  });
});

describe('evaluateComputeSpecs', () => {
  const referenceTime = new Date('2024-01-10T12:00:00Z');

  const observations: Observation[] = [
    createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
    createObservation('2', 'health.exercise', { minutes: 30 }, hoursAgo(2, referenceTime)),
  ];

  it('returns result with highest confidence', () => {
    const specs: ComputeSpec[] = [
      {
        id: 'low-conf',
        observationTypes: ['health.sleep'],
        aggregation: 'latest',
        confidence: 0.5,
      },
      {
        id: 'high-conf',
        observationTypes: ['health.exercise'],
        aggregation: 'latest',
        confidence: 0.9,
      },
    ];

    const result = evaluateComputeSpecs(specs, observations, referenceTime);
    expect(result.confidence).toBe(0.9);
    expect(result.value).toBe(30);
  });

  it('handles empty specs array', () => {
    const result = evaluateComputeSpecs([], observations, referenceTime);
    expect(result.value).toBeUndefined();
    expect(result.confidence).toBe(0);
  });

  it('prefers result with value over one without', () => {
    const specs: ComputeSpec[] = [
      {
        id: 'no-match',
        observationTypes: ['mood.journal'],
        aggregation: 'latest',
        confidence: 1.0,
      },
      {
        id: 'has-match',
        observationTypes: ['health.sleep'],
        aggregation: 'latest',
        confidence: 0.5,
      },
    ];

    const result = evaluateComputeSpecs(specs, observations, referenceTime);
    expect(result.value).toBe(7);
    expect(result.confidence).toBe(0.5);
  });

  it('returns result with most matches when no values', () => {
    const noValueObs: Observation[] = [
      createObservation('1', 'event.a', { text: 'a' }, hoursAgo(1, referenceTime)),
      createObservation('2', 'event.a', { text: 'b' }, hoursAgo(2, referenceTime)),
      createObservation('3', 'event.b', { text: 'c' }, hoursAgo(3, referenceTime)),
    ];

    const specs: ComputeSpec[] = [
      {
        id: 'fewer',
        observationTypes: ['event.b'],
        aggregation: 'avg', // Will fail to extract value
      },
      {
        id: 'more',
        observationTypes: ['event.a'],
        aggregation: 'avg', // Will fail to extract value
      },
    ];

    const result = evaluateComputeSpecs(specs, noValueObs, referenceTime);
    expect(result.matchedCount).toBe(2); // From 'more' spec
  });
});
