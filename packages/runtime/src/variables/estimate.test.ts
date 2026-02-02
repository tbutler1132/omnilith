// Tests for Variable Estimate Derivation

import { describe, it, expect } from 'vitest';
import type { Variable, Observation, ViableRange, VariableEstimate } from '@omnilith/protocol';
import {
  deriveEstimate,
  deriveEstimates,
  isInRange,
  isInPreferredBounds,
  getRangeCenter,
  calculateDeviation,
  calculateTrend,
} from './estimate.js';

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

// Helper to create a test variable
function createVariable(overrides: Partial<Variable> = {}): Variable {
  return {
    id: 'var-1',
    nodeId: 'test-node',
    key: 'test_variable',
    title: 'Test Variable',
    kind: 'continuous',
    computeSpecs: [
      {
        id: 'spec-1',
        observationTypes: ['test.*'],
        aggregation: 'avg',
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('isInRange', () => {
  it('returns true when no range defined', () => {
    expect(isInRange(50, undefined)).toBe(true);
  });

  it('checks min bound', () => {
    const range: ViableRange = { min: 10 };
    expect(isInRange(15, range)).toBe(true);
    expect(isInRange(10, range)).toBe(true);
    expect(isInRange(5, range)).toBe(false);
  });

  it('checks max bound', () => {
    const range: ViableRange = { max: 100 };
    expect(isInRange(50, range)).toBe(true);
    expect(isInRange(100, range)).toBe(true);
    expect(isInRange(150, range)).toBe(false);
  });

  it('checks both bounds', () => {
    const range: ViableRange = { min: 10, max: 100 };
    expect(isInRange(50, range)).toBe(true);
    expect(isInRange(10, range)).toBe(true);
    expect(isInRange(100, range)).toBe(true);
    expect(isInRange(5, range)).toBe(false);
    expect(isInRange(150, range)).toBe(false);
  });
});

describe('isInPreferredBounds', () => {
  it('returns true when no range defined', () => {
    expect(isInPreferredBounds(50, undefined)).toBe(true);
  });

  it('uses softMin/softMax when defined', () => {
    const range: ViableRange = { min: 0, max: 100, softMin: 20, softMax: 80 };
    expect(isInPreferredBounds(50, range)).toBe(true);
    expect(isInPreferredBounds(20, range)).toBe(true);
    expect(isInPreferredBounds(80, range)).toBe(true);
    expect(isInPreferredBounds(15, range)).toBe(false);
    expect(isInPreferredBounds(85, range)).toBe(false);
  });

  it('falls back to min/max when soft bounds not defined', () => {
    const range: ViableRange = { min: 10, max: 90 };
    expect(isInPreferredBounds(50, range)).toBe(true);
    expect(isInPreferredBounds(5, range)).toBe(false);
    expect(isInPreferredBounds(95, range)).toBe(false);
  });
});

describe('getRangeCenter', () => {
  it('returns undefined for no range', () => {
    expect(getRangeCenter(undefined)).toBeUndefined();
  });

  it('calculates center from soft bounds', () => {
    const range: ViableRange = { min: 0, max: 100, softMin: 20, softMax: 80 };
    expect(getRangeCenter(range)).toBe(50); // (20 + 80) / 2
  });

  it('falls back to min/max', () => {
    const range: ViableRange = { min: 10, max: 90 };
    expect(getRangeCenter(range)).toBe(50); // (10 + 90) / 2
  });

  it('handles single bound', () => {
    expect(getRangeCenter({ min: 10 })).toBe(10);
    expect(getRangeCenter({ max: 90 })).toBe(90);
  });
});

describe('calculateDeviation', () => {
  it('returns 0 when no ranges defined', () => {
    expect(calculateDeviation(50, undefined, undefined)).toBe(0);
  });

  it('returns 0 at preferred center', () => {
    const viable: ViableRange = { min: 0, max: 100 };
    const preferred: ViableRange = { softMin: 40, softMax: 60 };
    expect(calculateDeviation(50, viable, preferred)).toBe(0);
  });

  it('returns ~0.5 at viable boundary', () => {
    const viable: ViableRange = { min: 0, max: 100 };
    const preferred: ViableRange = { softMin: 40, softMax: 60 };
    // At viable boundary (0 or 100), deviation should be ~0.5
    const deviationAtMin = calculateDeviation(0, viable, preferred);
    const deviationAtMax = calculateDeviation(100, viable, preferred);
    expect(deviationAtMin).toBeCloseTo(0.5, 1);
    expect(deviationAtMax).toBeCloseTo(0.5, 1);
  });

  it('returns > 0.5 outside viable range', () => {
    const viable: ViableRange = { min: 0, max: 100 };
    expect(calculateDeviation(-50, viable, undefined)).toBeGreaterThan(0.5);
    expect(calculateDeviation(150, viable, undefined)).toBeGreaterThan(0.5);
  });

  it('caps at 1', () => {
    const viable: ViableRange = { min: 0, max: 100 };
    expect(calculateDeviation(-1000, viable, undefined)).toBeLessThanOrEqual(1);
    expect(calculateDeviation(1000, viable, undefined)).toBeLessThanOrEqual(1);
  });
});

describe('calculateTrend', () => {
  it('returns stable for small changes', () => {
    const variable = createVariable({
      viableRange: { min: 0, max: 100 },
    });
    expect(calculateTrend(50, 50.5, variable)).toBe('stable');
  });

  it('returns improving when moving toward center', () => {
    const variable = createVariable({
      viableRange: { min: 0, max: 100 },
      preferredRange: { softMin: 40, softMax: 60 },
    });
    // Moving from 30 to 45 (toward center of 50)
    expect(calculateTrend(45, 30, variable)).toBe('improving');
    // Moving from 70 to 55 (toward center of 50)
    expect(calculateTrend(55, 70, variable)).toBe('improving');
  });

  it('returns degrading when moving away from center', () => {
    const variable = createVariable({
      viableRange: { min: 0, max: 100 },
      preferredRange: { softMin: 40, softMax: 60 },
    });
    // Moving from 45 to 30 (away from center of 50)
    expect(calculateTrend(30, 45, variable)).toBe('degrading');
    // Moving from 55 to 70 (away from center of 50)
    expect(calculateTrend(70, 55, variable)).toBe('degrading');
  });

  it('uses higher-is-better as default without center', () => {
    const variable = createVariable();
    expect(calculateTrend(60, 50, variable)).toBe('improving');
    expect(calculateTrend(40, 50, variable)).toBe('degrading');
  });
});

describe('deriveEstimate', () => {
  const referenceTime = new Date('2024-01-10T12:00:00Z');

  describe('basic derivation', () => {
    it('derives estimate from observations', () => {
      const variable = createVariable({
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['health.sleep'],
            aggregation: 'avg',
          },
        ],
      });

      const observations: Observation[] = [
        createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
        createObservation('2', 'health.sleep', { hours: 8 }, hoursAgo(2, referenceTime)),
        createObservation('3', 'health.sleep', { hours: 6 }, hoursAgo(3, referenceTime)),
      ];

      const estimate = deriveEstimate(variable, observations, { referenceTime });

      expect(estimate).not.toBeNull();
      expect(estimate!.variableId).toBe('var-1');
      expect(estimate!.value).toBe(7); // (7 + 8 + 6) / 3
      expect(estimate!.confidence).toBe(1.0);
      expect(estimate!.computedAt).toBe(referenceTime.toISOString());
    });

    it('returns null when no observations match', () => {
      const variable = createVariable({
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['mood.journal'],
            aggregation: 'avg',
          },
        ],
      });

      const observations: Observation[] = [
        createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
      ];

      const estimate = deriveEstimate(variable, observations, { referenceTime });
      expect(estimate).toBeNull();
    });

    it('returns null for empty observations', () => {
      const variable = createVariable();
      const estimate = deriveEstimate(variable, [], { referenceTime });
      expect(estimate).toBeNull();
    });
  });

  describe('range checking', () => {
    it('calculates inViableRange correctly', () => {
      const variable = createVariable({
        viableRange: { min: 5, max: 10 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      // In range
      const inRange = deriveEstimate(
        variable,
        [createObservation('1', 'test', 7, hoursAgo(1, referenceTime))],
        { referenceTime }
      );
      expect(inRange!.inViableRange).toBe(true);

      // Out of range (low)
      const lowRange = deriveEstimate(
        variable,
        [createObservation('1', 'test', 3, hoursAgo(1, referenceTime))],
        { referenceTime }
      );
      expect(lowRange!.inViableRange).toBe(false);

      // Out of range (high)
      const highRange = deriveEstimate(
        variable,
        [createObservation('1', 'test', 15, hoursAgo(1, referenceTime))],
        { referenceTime }
      );
      expect(highRange!.inViableRange).toBe(false);
    });

    it('calculates inPreferredRange correctly', () => {
      const variable = createVariable({
        viableRange: { min: 0, max: 100 },
        preferredRange: { softMin: 40, softMax: 60 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      // In preferred range
      const inPreferred = deriveEstimate(
        variable,
        [createObservation('1', 'test', 50, hoursAgo(1, referenceTime))],
        { referenceTime }
      );
      expect(inPreferred!.inPreferredRange).toBe(true);
      expect(inPreferred!.inViableRange).toBe(true);

      // In viable but not preferred
      const viableOnly = deriveEstimate(
        variable,
        [createObservation('1', 'test', 20, hoursAgo(1, referenceTime))],
        { referenceTime }
      );
      expect(viableOnly!.inPreferredRange).toBe(false);
      expect(viableOnly!.inViableRange).toBe(true);
    });
  });

  describe('deviation calculation', () => {
    it('calculates deviation for center value', () => {
      const variable = createVariable({
        viableRange: { min: 0, max: 100 },
        preferredRange: { softMin: 40, softMax: 60 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      const estimate = deriveEstimate(
        variable,
        [createObservation('1', 'test', 50, hoursAgo(1, referenceTime))],
        { referenceTime }
      );

      expect(estimate!.deviation).toBe(0);
    });

    it('calculates deviation for boundary value', () => {
      const variable = createVariable({
        viableRange: { min: 0, max: 100 },
        preferredRange: { softMin: 40, softMax: 60 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      const estimate = deriveEstimate(
        variable,
        [createObservation('1', 'test', 0, hoursAgo(1, referenceTime))],
        { referenceTime }
      );

      expect(estimate!.deviation).toBeCloseTo(0.5, 1);
    });
  });

  describe('trend calculation', () => {
    it('calculates trend from previous estimate', () => {
      const variable = createVariable({
        viableRange: { min: 0, max: 100 },
        preferredRange: { softMin: 40, softMax: 60 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      const previousEstimate: VariableEstimate = {
        variableId: 'var-1',
        value: 30,
        confidence: 1.0,
        computedAt: hoursAgo(24, referenceTime),
        inViableRange: true,
        inPreferredRange: false,
        deviation: 0.2,
      };

      const observations = [
        createObservation('1', 'test', 45, hoursAgo(1, referenceTime)),
      ];

      const estimate = deriveEstimate(variable, observations, {
        referenceTime,
        previousEstimate,
      });

      expect(estimate!.trend).toBe('improving'); // 30 -> 45, toward center of 50
    });

    it('calculates trend from previous observations', () => {
      const variable = createVariable({
        viableRange: { min: 0, max: 100 },
        preferredRange: { softMin: 40, softMax: 60 },
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      const observations = [
        createObservation('1', 'test', 45, hoursAgo(1, referenceTime)),
      ];

      const previousObservations = [
        createObservation('0', 'test', 30, hoursAgo(25, referenceTime)),
      ];

      const estimate = deriveEstimate(variable, observations, {
        referenceTime,
        previousObservations,
        trendWindowHours: 24,
      });

      expect(estimate!.trend).toBe('improving');
    });

    it('returns undefined trend when no previous data', () => {
      const variable = createVariable({
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['test'],
            aggregation: 'latest',
          },
        ],
      });

      const observations = [
        createObservation('1', 'test', 50, hoursAgo(1, referenceTime)),
      ];

      const estimate = deriveEstimate(variable, observations, { referenceTime });

      expect(estimate!.trend).toBeUndefined();
    });
  });
});

describe('deriveEstimates', () => {
  const referenceTime = new Date('2024-01-10T12:00:00Z');

  it('derives estimates for multiple variables', () => {
    const variables: Variable[] = [
      createVariable({
        id: 'var-1',
        key: 'sleep',
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['health.sleep'],
            aggregation: 'avg',
          },
        ],
      }),
      createVariable({
        id: 'var-2',
        key: 'exercise',
        computeSpecs: [
          {
            id: 'spec-2',
            observationTypes: ['health.exercise'],
            aggregation: 'sum',
          },
        ],
      }),
    ];

    const observations: Observation[] = [
      createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
      createObservation('2', 'health.sleep', { hours: 8 }, hoursAgo(2, referenceTime)),
      createObservation('3', 'health.exercise', { minutes: 30 }, hoursAgo(1, referenceTime)),
      createObservation('4', 'health.exercise', { minutes: 45 }, hoursAgo(2, referenceTime)),
    ];

    const result = deriveEstimates(variables, observations, { referenceTime });

    expect(result.estimates.size).toBe(2);
    expect(result.failures.size).toBe(0);

    expect(result.estimates.get('var-1')!.value).toBe(7.5); // (7 + 8) / 2
    expect(result.estimates.get('var-2')!.value).toBe(75); // 30 + 45
  });

  it('records failures for variables that cannot be estimated', () => {
    const variables: Variable[] = [
      createVariable({
        id: 'var-1',
        key: 'sleep',
        computeSpecs: [
          {
            id: 'spec-1',
            observationTypes: ['health.sleep'],
            aggregation: 'avg',
          },
        ],
      }),
      createVariable({
        id: 'var-2',
        key: 'mood',
        computeSpecs: [
          {
            id: 'spec-2',
            observationTypes: ['mood.journal'], // No matching observations
            aggregation: 'latest',
          },
        ],
      }),
    ];

    const observations: Observation[] = [
      createObservation('1', 'health.sleep', { hours: 7 }, hoursAgo(1, referenceTime)),
    ];

    const result = deriveEstimates(variables, observations, { referenceTime });

    expect(result.estimates.size).toBe(1);
    expect(result.failures.size).toBe(1);
    expect(result.failures.get('var-2')).toBe('No observations matched compute specs');
  });
});
